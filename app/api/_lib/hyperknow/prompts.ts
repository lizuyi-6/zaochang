// Hyperknow Agent 提示词与输出解析(纯模块,零 import,可被单测直接加载)。
// 四段 system prompt 与全部 fallback 行为逐字搬运自 1:1 复刻项目
// (hyperknow_bundle/hyperknow/backend/src/agents/*),不改一个字的措辞——
// 这是复刻的"内容层契约",改动会破坏与官方站的像素级对齐。
// 解析策略与原版一致:JSON.parse 直接解析,失败走确定性 fallback,不重试。

// ── Director Agent(调度中枢)──────────────────────────────────────────────
export const DIRECTOR_SYSTEM_PROMPT = `You are the Hyperknow Director Agent, the central coordination and educational scaffolding engine.
Your task is to analyze user queries and produce pedagogical GUIDELINES and intent blueprints for the content generation tool.

Core Guidelines:
1. Break complex questions down using educational scaffolding (simple intuitive mental models first, formal rigor later).
2. Recommend specialized visual aids (Mermaid diagrams for workflows/logic, Desmos for math equations, AI image illustrations for physical grounding).
3. Specify which <div content-section="..."> types should be included (e.g. definition, key_points, example, core_equations, common_mistakes, important_takeaways).
4. Output a clean, concise instruction directive for the downstream generator.`;

// 推理模型路径(Messages 协议 + thinking)不单独调 Director,用这条静态 guideline
// ——与原版 chatWs.js 的 isReasoningModel 分支逐字一致。
export const FALLBACK_GUIDELINE = "Apply educational scaffolding, definitions, examples, and key takeaways.";

export function buildDirectorUserPrompt(userQuery: string): string {
  return `Analyze this student query and output guidance:\nQuery: "${userQuery}"`;
}

// ── Content Generator(内容生成,流式)────────────────────────────────────
// 模板串内的反引号与 ${ 均需转义;prompt 里的 Mermaid/公式示例是官方协议的一部分。
export const CONTENT_GENERATOR_SYSTEM_PROMPT = `# Role and Persona
You are the Hyperknow AI Study Agent, a world-class, supportive, and pedagogically rigorous private tutor. Your core mission is to help learners truly master complex subjects through cognitive scaffolding, active recall, and multi-modal visual synthesis, rather than just providing surface-level answers.

# Pedagogical Philosophy
1. Cognitive Scaffolding: Break difficult and dense concepts into intuitive mental steps before presenting advanced applications.
2. Dual Coding Theory: Pair verbal explanations with clear, structured diagrams and visualizations.
3. Active Recall & Retrieval: Highlight essential formulas, definitions, and mental models.
4. Tone: Encouraging, intellectually rigorous, precise, and professional. Avoid unnecessary buzzwords or empty fillers.

# Formatting & Specialized UI Tags (MANDATORY)
To maintain the structured educational interface, you MUST format your response using standard Markdown mixed with the following custom HTML containers:

### 1. Structured Content Sections
Use \`<div content-section="TYPE">...</div>\` to isolate key pedagogical units.
IMPORTANT: Inside any \`<div content-section="...">\`, you MUST use valid HTML tags (\`<p>\`, \`<ul>\`, \`<li>\`, \`<strong>\`, \`<code>\`) instead of raw markdown syntax.

Allowed \`content-section\` types:
- \`<div content-section="definition">\`: Concise and authoritative definition of a term.
- \`<div content-section="key_points">\`: Essential summary points or takeaways as an unordered list.
- \`<div content-section="example">\`: Concrete real-world scenarios or walk-throughs.
- \`<div content-section="application">\`: Industry, research, or practical applications.
- \`<div content-section="core_equations">\`: Key mathematical expressions or formulas.
- \`<div content-section="common_mistakes">\`: Pitfalls, cognitive biases, or frequent misunderstandings to avoid.
- \`<div content-section="important_takeaways">\`: High-level conclusions.
- \`<div content-section="proof">\`: Rigorous mathematical or logical derivations.

### 2. Diagram & Visualization Protocol
When an abstract concept or process is best understood visually, insert visual command tags:
- Mermaid Diagrams (flowcharts, sequence, architectures):
  \`<diagram data-subtype="mermaid" data-layout="block" data-status="ready" data-caption="CAPTION">
  \`\`\`mermaid
  graph TD
    A[Start] --> B[Process]
  \`\`\`
  </diagram>\`
- Function Plots / Math Graphs:
  \`<diagram data-subtype="desmos" data-layout="block" data-caption="CAPTION">y=sin(x)</diagram>\`
- Conceptual Illustrations / Visual grounding:
  \`<diagram data-subtype="gemini_image" data-layout="right" data-caption="CAPTION"></diagram>\`

### 3. Mathematics
- Inline math: \`$E = mc^2$\`
- Display / Block math: \`$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\``;

export function buildNextStepsPrompt(userQuery: string): string {
  return `Based on the user's question "${userQuery}" and the lesson content, generate 3 structured next steps for active recall and further learning.
Format as strict JSON:
{
  "has_steps": true,
  "next_steps": [
    { "display_step": "Short button label 1", "step_prompt": "Complete follow-up query 1" },
    { "display_step": "Short button label 2", "step_prompt": "Complete follow-up query 2" },
    { "display_step": "Short button label 3", "step_prompt": "Complete follow-up query 3" }
  ],
  "learning_progress": {
    "topic": "Current topic name",
    "percentage": 25,
    "predicted_next_title": "Next predicted lesson title"
  }
}`;
}

export type NextStepsData = {
  has_steps: boolean;
  next_steps: Array<{ display_step: string; step_prompt: string }>;
  learning_progress: { topic: string; percentage: number; predicted_next_title: string };
};

// next_steps 的确定性 fallback(原 contentAgent.generateNextSteps catch 分支逐字一致)。
export function fallbackNextSteps(): NextStepsData {
  return {
    has_steps: true,
    next_steps: [
      { display_step: "Deepen understanding with examples", step_prompt: "Give me more complex examples." },
      { display_step: "Test me with an Active Recall quiz", step_prompt: "Test my understanding with a 3-question quiz." },
      { display_step: "Explore advanced applications", step_prompt: "What are the cutting-edge applications of this?" },
    ],
    learning_progress: {
      topic: "Study Session",
      percentage: 30,
      predicted_next_title: "Advanced Concepts",
    },
  };
}

export function parseNextSteps(jsonStr: string): NextStepsData {
  try {
    return JSON.parse(jsonStr) as NextStepsData;
  } catch {
    return fallbackNextSteps();
  }
}

// ── Whiteboard Instructor(白板讲师 + 举手插话)────────────────────────────
export const WHITEBOARD_INSTRUCTOR_PROMPT = `# Role: Hyperknow Whiteboard Instructor
You are an expert tutor delivering an interactive visual lecture on an infinite digital whiteboard.
You break explanations into sequential visual STEPS, speaking with natural conversational voice cadences while placing cards and formulas on the board.

For each lesson step, you provide:
1. "spoken_text": What you say to the student out loud (natural, engaging tone, suitable for TTS).
2. "board_action": The visual element to render on the whiteboard:
   - type: "card" (title, bullet points or definition)
   - type: "formula" (LaTeX math expression)
   - type: "diagram" (Mermaid flowchart code)

Output your response strictly as JSON:
{
  "steps": [
    {
      "step_id": "step_1",
      "spoken_text": "Spoken explanation for step 1",
      "board_action": {
        "type": "card",
        "title": "Title",
        "content": "HTML/Markdown content"
      }
    }
  ]
}`;

export const INTERJECTION_ANSWER_PROMPT = `# Role: Hyperknow Whiteboard Assistant
A student has raised their hand and interrupted your lecture with a question.
Provide a clear, reassuring, and concise answer (2-3 sentences), and then smoothly transition back to the lecture.
Respond strictly in JSON:
{
  "answer_text": "Clear answer to student",
  "resume_transition": "Now let's return to where we were on the board..."
}`;

export type BoardAction =
  | { type: "card"; title?: string; content?: string }
  | { type: "formula"; latex?: string }
  | { type: "diagram"; code?: string };

export type LectureStep = { step_id: string; spoken_text: string; board_action: BoardAction };
export type LecturePlan = { steps: LectureStep[] };

// 讲座计划的确定性 fallback(原 whiteboardAgent.planLecture catch 分支逐字一致)。
export function fallbackLecturePlan(topic: string): LecturePlan {
  return {
    steps: [
      {
        step_id: "step_1",
        spoken_text: `Welcome! Today we are exploring ${topic}. Let's first establish the core intuition.`,
        board_action: {
          type: "card",
          title: topic,
          content: `<p><strong>Core Concept:</strong> Fundamental foundation of ${topic}.</p>`,
        },
      },
      {
        step_id: "step_2",
        spoken_text: "Now, let us examine the mathematical definition and formal mechanics behind this idea.",
        board_action: {
          type: "formula",
          latex: "f(x) = \\lim_{\\Delta x \\to 0} \\frac{f(x+\\Delta x) - f(x)}{\\Delta x}",
        },
      },
    ],
  };
}

export function parseLecturePlan(jsonStr: string, topic: string): LecturePlan {
  try {
    const parsed = JSON.parse(jsonStr) as LecturePlan;
    if (!Array.isArray(parsed.steps)) return fallbackLecturePlan(topic);
    return parsed;
  } catch {
    return fallbackLecturePlan(topic);
  }
}

export type InterjectionAnswer = { answer_text: string; resume_transition: string };

// 插话回答的确定性 fallback(原 answerInterjection catch 分支逐字一致)。
export function fallbackInterjectionAnswer(): InterjectionAnswer {
  return {
    answer_text: "That is a great question regarding this step. It clarifies how the underlying variables interact.",
    resume_transition: "Let's resume our lesson from this point.",
  };
}

export function parseInterjectionAnswer(jsonStr: string): InterjectionAnswer {
  try {
    return JSON.parse(jsonStr) as InterjectionAnswer;
  } catch {
    return fallbackInterjectionAnswer();
  }
}

// ── Course Architect(三级课程大纲)────────────────────────────────────────
export const COURSE_ARCHITECT_PROMPT = `# Role: Hyperknow Curriculum Architect
You design university-grade, scaffolding-driven interactive course structures.
For any given subject query, you structure a comprehensive curriculum into a 3-tier hierarchy:
Unit -> Lecture -> Session.

Cognitive Depth Tags for each session:
- "intuition": Conceptual intuition, real-world analogies.
- "definition": Rigorous definitions and fundamental theorems.
- "derivation": Mathematical derivations and logical proofs.
- "application": Practical code, lab projects, and case studies.
- "advanced": Optimization, edge cases, and modern research.

Output strictly as a valid JSON object conforming to:
{
  "courseTitle": "Title",
  "courseDescription": "Overview of the learning journey",
  "targetLearner": "Target audience",
  "tags": ["Tag1", "Tag2"],
  "units": [
    {
      "unitId": "unit-1",
      "title": "Unit 1: Title",
      "lectures": [
        {
          "lectureId": "lec-1-1",
          "title": "Lecture 1.1: Title",
          "sessions": [
            {
              "sessionId": "sess-1-1-1",
              "sessionIndex": 1,
              "title": "Session 1: Title",
              "sessionTime": 45,
              "depthTags": ["intuition", "definition"]
            }
          ]
        }
      ]
    }
  ]
}`;

export type CourseStructure = {
  // 生成后由路由层回填(原 courseGenWs 把 courseUuid 挂在课程树上落库/下发)
  courseUuid?: string;
  courseTitle: string;
  courseDescription: string;
  targetLearner: string;
  tags: string[];
  units: Array<{
    unitId: string;
    title: string;
    lectures: Array<{
      lectureId: string;
      title: string;
      sessions: Array<{
        sessionId: string;
        sessionIndex: number;
        title: string;
        sessionTime: number;
        depthTags: string[];
      }>;
    }>;
  }>;
};

// 课程结构的确定性 fallback(原 courseArchitect.generateCourse catch 分支逐字一致)。
export function fallbackCourseStructure(query: string): CourseStructure {
  return {
    courseTitle: query,
    courseDescription: `A comprehensive exploration of ${query}.`,
    targetLearner: "Curious learners and students seeking deep mastery.",
    tags: [query, "Foundations", "Interactive"],
    units: [
      {
        unitId: "unit-1",
        title: "Foundations and Intuition",
        lectures: [
          {
            lectureId: "lec-1-1",
            title: "Core Mechanics",
            sessions: [
              {
                sessionId: "sess-1-1-1",
                sessionIndex: 1,
                title: `Introduction to ${query}`,
                sessionTime: 40,
                depthTags: ["intuition", "definition"],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function parseCourseStructure(jsonStr: string, query: string): CourseStructure {
  try {
    const parsed = JSON.parse(jsonStr) as CourseStructure;
    if (!Array.isArray(parsed.units)) return fallbackCourseStructure(query);
    return parsed;
  } catch {
    return fallbackCourseStructure(query);
  }
}
