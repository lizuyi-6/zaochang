import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import type { CourseBrief } from "../../_lib/hyperknow/protocol";

export const dynamic = "force-dynamic";

export interface InquiryQuestion {
  id: string;
  field: keyof Omit<CourseBrief, "version">;
  prompt: string;
  recommended: string;
  options: string[];
}

export interface InquiryResponse {
  brief: CourseBrief;
  questions: InquiryQuestion[];
  followUpAllowed: boolean;
  followUpRound: number;
}

// 推荐问询模版: 3-5 问询推荐继续，必要时最多 2 次智能追问 (中英双语自适应)
export function generateDefaultInquiries(topic: string, currentBrief?: CourseBrief): InquiryQuestion[] {
  const isZh = (currentBrief?.language?.toLowerCase().startsWith("zh") ?? false) || /[\u4e00-\u9fa5]/.test(topic);
  const isCodeOrTech = /(python|react|rust|node|ai|machine learning|code|api|web|algorithm|database|微积分|物理|数学|代码|编程|算法)/i.test(topic);

  if (isZh) {
    return [
      {
        id: "goal",
        field: "goal",
        prompt: `你学习《${topic}》的核心目标是什么？`,
        recommended: currentBrief?.goal || (isCodeOrTech ? "掌握核心原理与实战落地应用" : "系统掌握核心原理与实际应用"),
        options: isCodeOrTech
          ? ["掌握核心原理与实战落地应用", "快速攻克考试与核心考点", "完成生产级实战项目", "深入底层原理与系统架构"]
          : ["系统掌握核心原理与实际应用", "快速攻克考试与核心考点", "通识科普与宏观视野建立", "深入经典理论与专业推导"],
      },
      {
        id: "background",
        field: "background",
        prompt: "你当前的相关知识储备与先修基础如何？",
        recommended: currentBrief?.background || "具备基础好奇心的初学者",
        options: [
          "零基础跨专业入门",
          "具备基础好奇心的初学者",
          "具备一定基础的进阶学习者",
          "寻求专题突破的资深从业者",
        ],
      },
      {
        id: "duration",
        field: "duration",
        prompt: "你的预期学习周期与时间预算？",
        recommended: currentBrief?.duration || "标准节奏（2-4 周，自适应学习）",
        options: [
          "高效冲刺（1-3 天速成）",
          "标准节奏（2-4 周，自适应学习）",
          "系统大课（1-2 个月深度掌握）",
        ],
      },
      {
        id: "depth",
        field: "depth",
        prompt: "希望达到什么样的知识深度？",
        recommended: currentBrief?.depth || "系统实战（理论兼顾实操）",
        options: [
          "核心通识（二八法则快速入门）",
          "系统实战（理论兼顾实操）",
          "严谨学术（完整逻辑推导）",
          "工业级深度（解决复杂实际问题）",
        ],
      },
      {
        id: "preference",
        field: "preference",
        prompt: "你偏好的白板授课与互动形式？",
        recommended: currentBrief?.preference || "项目实操结合白板板书图解",
        options: [
          "项目实操结合白板板书图解",
          "苏格拉底式启发提问与逐步推导",
          "微课切片结合高频随堂测验",
          "真实案例拆解与踩坑复盘",
        ],
      },
    ];
  }

  return [
    {
      id: "goal",
      field: "goal",
      prompt: `What is your primary learning goal for "${topic}"?`,
      recommended: currentBrief?.goal || (isCodeOrTech ? "Build production-ready projects" : "Master core principles and practical skills"),
      options: isCodeOrTech
        ? ["Build production-ready projects", "Pass interviews & technical exams", "Quick concept overview", "Deep architectural mastery"]
        : ["Master core principles and practical skills", "Academic/exam preparation", "Everyday practical application", "Comprehensive deep dive"],
    },
    {
      id: "background",
      field: "background",
      prompt: "What is your current background / prerequisite knowledge?",
      recommended: currentBrief?.background || "Beginner with foundational curiosity",
      options: [
        "Complete beginner (zero prior knowledge)",
        "Beginner with foundational curiosity",
        "Intermediate practitioner with basic experience",
        "Advanced practitioner seeking specialized mastery",
      ],
    },
    {
      id: "duration",
      field: "duration",
      prompt: "What is your available time budget / learning pace?",
      recommended: currentBrief?.duration || "Standard (2-4 weeks, self-paced)",
      options: [
        "Crash course (1-3 days intensive)",
        "Standard (2-4 weeks, self-paced)",
        "Deep curriculum (1-2 months structured)",
      ],
    },
    {
      id: "depth",
      field: "depth",
      prompt: "What target depth level are you aiming for?",
      recommended: currentBrief?.depth || "Practical & Comprehensive",
      options: [
        "Foundational Overview (80/20 essentials)",
        "Practical & Comprehensive",
        "Rigorous & Theoretical",
        "System Design & Production-grade",
      ],
    },
    {
      id: "preference",
      field: "preference",
      prompt: "What is your preferred pedagogical and visual style?",
      recommended: currentBrief?.preference || "Project-based hands-on with visual whiteboard diagrams",
      options: [
        "Project-based hands-on with visual whiteboard diagrams",
        "Socratic dialogue and step-by-step proofs",
        "Bite-sized micro-lessons with frequent quizzes",
        "Case study driven with real-world breakdowns",
      ],
    },
  ];
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    await enforceRateLimit(await rateLimitKey("hyperknow-course-inquiry", member.email), 30, 3600);

    const input = (await request.json().catch(() => ({}))) as {
      topic?: unknown;
      brief?: CourseBrief;
      answers?: Record<string, string>;
      followUpRound?: unknown;
    };

    const topic = typeof input.topic === "string" ? input.topic.trim().slice(0, 300) : "";
    if (!topic) {
      return Response.json({ error: "topic_required" }, { status: 400 });
    }

    const currentRound = typeof input.followUpRound === "number" ? Math.max(0, input.followUpRound) : 0;
    const briefInput = input.brief ?? {};
    const answers = input.answers ?? {};

    // 组装版本化的 CourseBrief
    const updatedBrief: CourseBrief = {
      version: (briefInput.version ?? 0) + 1,
      goal: answers.goal?.trim() || briefInput.goal || "Master core concepts and practical application",
      background: answers.background?.trim() || briefInput.background || "Beginner with foundational curiosity",
      duration: answers.duration?.trim() || briefInput.duration || "Standard (2-4 weeks, self-paced)",
      depth: answers.depth?.trim() || briefInput.depth || "Practical & Comprehensive",
      preference: answers.preference?.trim() || briefInput.preference || "Project-based hands-on with visual whiteboard diagrams",
      language: answers.language?.trim() || briefInput.language || "zh-CN",
      visual: answers.visual?.trim() || briefInput.visual || "Hand-drawn whiteboard diagrams & clean cards",
    };

    // 最多 2 轮智能追问限制 (round 0 允许追问第 1 轮，round 1 允许追问第 2 轮，>=2 截止)
    const followUpAllowed = currentRound < 2;

    let questions = generateDefaultInquiries(topic, updatedBrief);

    // 如果已经是追问轮次，针对性生成 1-2 个深化/澄清追问 (中英双语自适应)
    if (currentRound === 1) {
      const isZh = (updatedBrief.language?.toLowerCase().startsWith("zh") ?? false) || /[\u4e00-\u9fa5]/.test(topic);
      questions = isZh
        ? [
            {
              id: "focus_area",
              field: "preference",
              prompt: `针对《${topic}》，你更希望最终能交付实战大作业，还是吃透严谨的理论概念？`,
              recommended: "可用于作品集展示的生产级实战项目",
              options: [
                "可用于作品集展示的生产级实战项目",
                "严谨的理论分类与定理推导",
                "核心高频踩坑点与工程排错指南",
              ],
            },
            {
              id: "visual_style",
              field: "visual",
              prompt: "在白板讲解过程中，你偏好高密度的架构图表还是精炼的概念卡片？",
              recommended: "包含逐步展开的高密度架构图表",
              options: [
                "包含逐步展开的高密度架构图表",
                "精炼的概念卡片与公式推导",
                "极简核心要点与直观示意图",
              ],
            },
          ]
        : [
            {
              id: "focus_area",
              field: "preference",
              prompt: `For "${topic}", would you like to focus on specific capstone deliverables or formal conceptual frameworks?`,
              recommended: "Portfolio-ready capstone deliverable",
              options: [
                "Portfolio-ready capstone deliverable",
                "Rigorous conceptual taxonomy & derivations",
                "Fast troubleshooting & real-world war stories",
              ],
            },
            {
              id: "visual_style",
              field: "visual",
              prompt: "Do you prefer high-density technical diagrams or conceptual card outlines on the whiteboard?",
              recommended: "High-density technical diagrams with step-by-step reveals",
              options: [
                "High-density technical diagrams with step-by-step reveals",
                "Conceptual cards and formula derivations",
                "Minimalist key takeaways with illustrated concepts",
              ],
            },
          ];
    }

    return Response.json({
      brief: updatedBrief,
      questions,
      followUpAllowed,
      followUpRound: currentRound,
    });
  } catch (error) {
    return jsonError(error);
  }
}
