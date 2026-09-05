// Hyperknow Agent 客户端适配器:原复刻项目走三路 WebSocket(ws://localhost:8080),
// 接入造场后服务端改为 SSE/REST(相对路径 /api/hyperknow/**,见 app/api/hyperknow/)。
// 本文件以"同接口适配器"封装协议迁移:类名、方法签名、事件 type 序列与原 WS 版
// 逐一对齐,页面层(Home/ChatResponse/WhiteboardPage/CoursesPage)零改动。
// 鉴权不再由前端承担:同源请求自动携带造场会话 Cookie,401/403 以 {type:'error'}
// 事件透出(页面据此停止加载态)。

const API_BASE = '/api/hyperknow';

type FrameHandler = (data: any) => void;

// 白板单步讲解节奏:正文字数 × 180ms,最少 4 秒。与服务端
// app/api/_lib/hyperknow/protocol.ts 的 stepDurationMs 公式逐字一致——
// 服务端 setTimeout 链已改客户端驱动,两端公式必须同源维护。
function stepDurationMs(spokenText: string): number {
  return Math.max(4000, spokenText.length * 180);
}

// 解析 `event: frame\ndata: {...}\n\n` SSE 帧,逐帧回调(与服务端 frame() 编码对应)。
async function* readSseFrames(response: Response): AsyncGenerator<any> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let frameEnd = buffer.indexOf('\n\n');
      while (frameEnd >= 0) {
        const frameText = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        frameEnd = buffer.indexOf('\n\n');
        const dataLine = frameText.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        try {
          yield JSON.parse(dataLine.slice(5).trim());
        } catch {
          // 坏帧忽略,不让单个坏 JSON 杀死整条流(与服务端解析器同策略)。
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function errorPayload(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const code = (body as any)?.error || (body as any)?.message;
  return typeof code === 'string' ? code : `HTTP ${response.status}`;
}

export class ChatWsClient {
  private onMessageCb: FrameHandler;
  private onOpenCb?: () => void;
  private controller: AbortController | null = null;

  constructor(onMessage: FrameHandler, onOpen?: () => void) {
    this.onMessageCb = onMessage;
    this.onOpenCb = onOpen;
  }

  connect() {
    // SSE 版没有连接建立握手的语义:onOpen 触发即代表"可以发第一条消息"
    // (页面层契约与原 WS 相同——onOpen 回调里调 sendMessage(initialQuery))。
    if (this.onOpenCb) this.onOpenCb();
  }

  sendMessage(message: string, mode: string = 'standard') {
    void this.streamMessage(message, mode);
  }

  private async streamMessage(message: string, mode: string) {
    this.controller = new AbortController();
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, mode, ui_language: 'en' }),
        signal: this.controller.signal,
      });
      if (!response.ok || !response.body) {
        this.onMessageCb({ type: 'error', message: await errorPayload(response) });
        return;
      }
      for await (const data of readSseFrames(response)) {
        this.onMessageCb(data);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        this.onMessageCb({ type: 'error', message: 'network_error' });
      }
    }
  }

  close() {
    this.controller?.abort();
    this.controller = null;
  }
}

export class WhiteboardWsClient {
  private onMessageCb: FrameHandler;
  private sessionId: string | null = null;
  private steps: any[] = [];
  private currentStepIndex = 0;
  private paused = false;
  private closed = false;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceId = 'warm';
  private speed = 1.0;

  constructor(onMessage: FrameHandler) {
    this.onMessageCb = onMessage;
  }

  async connect(topic: string) {
    try {
      const response = await fetch(`${API_BASE}/whiteboard/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!response.ok || !response.body) {
        this.onMessageCb({ type: 'error', message: await errorPayload(response) });
        return;
      }
      const data = await response.json();
      this.sessionId = data.session_id;
      this.steps = Array.isArray(data.steps) ? data.steps : [];
      // session_ready 形状与原 WS 事件逐字段一致。
      this.onMessageCb({ type: 'session_ready', session_id: data.session_id, resumed: false, status: data.status || 'active', topic });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        this.onMessageCb({ type: 'error', message: 'network_error' });
      }
    }
  }

  // 讲座播放从服务端 setTimeout 链改为客户端驱动:逐步推板书(whiteboard_action)
  // 与旁白(narration_chunk),节奏沿用 stepDurationMs。音频 URL 为同源相对路径,
  // 由服务端计划数据 + 本地音色配置拼装(与原 synthesizeAudioMeta 的 180 字截断一致)。
  startTeaching(_sessionId: string, voiceId = 'warm', speed = 1.0) {
    this.voiceId = voiceId;
    this.speed = speed;
    this.currentStepIndex = 0;
    this.paused = false;
    this.deliverStep(0);
  }

  private deliverStep(index: number) {
    if (this.closed || this.paused || index >= this.steps.length) return;
    const step = this.steps[index];
    this.currentStepIndex = index;
    this.onMessageCb({ type: 'whiteboard_action', step_id: step.step_id, action: step.board_action });
    this.onMessageCb({
      type: 'narration_chunk',
      step_id: step.step_id,
      text: step.spoken_text,
      audio_meta: {
        voiceId: this.voiceId,
        speed: this.speed,
        audioUrl: `/api/hyperknow/tts/stream?text=${encodeURIComponent(step.spoken_text.slice(0, 180))}&voice=${this.voiceId}&speed=${this.speed}`,
      },
    });
    const duration = stepDurationMs(step.spoken_text);
    this.stepTimer = setTimeout(() => this.deliverStep(index + 1), duration);
  }

  // 举手打断:本地暂停推进(与原 narration_pause 语义一致)。
  interjectStart() {
    this.paused = true;
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
    this.onMessageCb({ type: 'narration_pause', paused: true, message: 'Lecture paused for student question.' });
  }

  interjectQuestion(text: string) {
    void this.submitInterjection(text);
  }

  private async submitInterjection(question: string) {
    this.onMessageCb({ type: 'interject_thinking', message: 'The instructor is thinking about your question...' });
    try {
      const response = await fetch(`${API_BASE}/whiteboard/interject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          step_id: this.steps[this.currentStepIndex]?.step_id ?? '',
          question,
        }),
      });
      if (!response.ok) {
        this.onMessageCb({ type: 'error', message: await errorPayload(response) });
        return;
      }
      const answer = await response.json();
      this.onMessageCb({ type: 'interject_answer', answer_text: answer.answer_text, resume_transition: answer.resume_transition });
      // 答疑后 5 秒恢复主线(与原服务端 setTimeout(5000) 节奏一致);原版恢复后
      // 推进链会因 isPaused 标记永久停摆,这里修正为从当前步继续推进。
      this.stepTimer = setTimeout(() => {
        this.paused = false;
        this.onMessageCb({ type: 'narration_resume', paused: false });
        this.deliverStep(this.currentStepIndex + 1);
      }, 5000);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        this.onMessageCb({ type: 'error', message: 'network_error' });
      }
    }
  }

  close() {
    this.closed = true;
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
  }
}

export class CourseGenWsClient {
  private onMessageCb: FrameHandler;
  private controller: AbortController | null = null;

  constructor(onMessage: FrameHandler) {
    this.onMessageCb = onMessage;
  }

  connect(query: string) {
    void this.streamGeneration(query);
  }

  private async streamGeneration(query: string) {
    this.controller = new AbortController();
    try {
      const response = await fetch(`${API_BASE}/course-generation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: this.controller.signal,
      });
      if (!response.ok || !response.body) {
        this.onMessageCb({ type: 'course_generation_error', message: await errorPayload(response) });
        return;
      }
      for await (const data of readSseFrames(response)) {
        this.onMessageCb(data);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        this.onMessageCb({ type: 'course_generation_error', message: 'network_error' });
      }
    }
  }

  close() {
    this.controller?.abort();
    this.controller = null;
  }
}
