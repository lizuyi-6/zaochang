import type { InquiryQuestion } from './backend';

/** 0ms 瞬间生成初始推荐问询，默认全中文友好，绝不转圈卡顿。
 *  (原在 Home.tsx;问询改为独立课程创建页后迁至此共享。) */
export function buildDefaultInquiryQuestions(prompt: string, isZh: boolean): InquiryQuestion[] {
  const isCodeOrTech = /(vue|react|angular|svelte|next|nuxt|vite|webpack|typescript|javascript|python|rust|golang|go|java|c\+\+|linux|docker|k8s|ai|llm|deep learning|machine learning|code|api|web|algorithm|database|微积分|物理|数学|代码|编程|算法)/i.test(prompt);

  if (isZh) {
    return [
      {
        id: 'goal',
        field: 'goal',
        prompt: `你学习《${prompt}》的核心目标是什么？`,
        recommended: isCodeOrTech ? '掌握核心概念与实战落地应用' : '系统掌握核心原理与实际应用',
        options: isCodeOrTech
          ? ['掌握核心概念与实战落地应用', '快速攻克考试与核心考点', '完成生产级实战项目', '深入底层原理与系统架构']
          : ['系统掌握核心原理与实际应用', '快速攻克考试与核心考点', '通识科普与宏观视野建立', '深入经典理论与专业推导'],
      },
      {
        id: 'background',
        field: 'background',
        prompt: '你当前的相关知识储备与先修基础如何？',
        recommended: '具备基础好奇心的初学者',
        options: [
          '零基础跨专业入门',
          '具备基础好奇心的初学者',
          '具备一定基础的进阶学习者',
          '寻求专题突破的资深从业者',
        ],
      },
      {
        id: 'duration',
        field: 'duration',
        prompt: '你的预期学习周期与时间预算？',
        recommended: '标准节奏（2-4 周，自适应学习）',
        options: [
          '高效冲刺（1-3 天速成）',
          '标准节奏（2-4 周，自适应学习）',
          '系统大课（1-2 个月深度掌握）',
        ],
      },
      {
        id: 'depth',
        field: 'depth',
        prompt: '希望达到什么样的知识深度？',
        recommended: '系统实战（理论兼顾实操）',
        options: [
          '核心通识（二八法则快速入门）',
          '系统实战（理论兼顾实操）',
          '严谨学术（完整逻辑推导）',
          '工业级深度（解决复杂实际问题）',
        ],
      },
      {
        id: 'preference',
        field: 'preference',
        prompt: '你偏好的白板授课与互动形式？',
        recommended: '项目实操结合白板板书图解',
        options: [
          '项目实操结合白板板书图解',
          '苏格拉底式启发提问与逐步推导',
          '微课切片结合高频随堂测验',
          '真实案例拆解与踩坑复盘',
        ],
      },
    ];
  }

  return [
    {
      id: 'goal',
      field: 'goal',
      prompt: `What is your primary learning goal for "${prompt}"?`,
      recommended: isCodeOrTech ? 'Master core principles and practical skills' : 'Comprehensive deep dive and understanding',
      options: isCodeOrTech
        ? ['Master core principles and practical skills', 'Build production-ready projects', 'Pass technical interviews & exams', 'Deep architectural mastery']
        : ['Comprehensive deep dive and understanding', 'Academic & exam preparation', 'Practical everyday application', 'Quick conceptual overview'],
    },
    {
      id: 'background',
      field: 'background',
      prompt: 'What is your current background / prerequisite knowledge?',
      recommended: 'Beginner with foundational curiosity',
      options: [
        'Complete beginner (zero prior knowledge)',
        'Beginner with foundational curiosity',
        'Intermediate practitioner with basic experience',
        'Advanced practitioner seeking specialized mastery',
      ],
    },
    {
      id: 'duration',
      field: 'duration',
      prompt: 'What is your available time budget / learning pace?',
      recommended: 'Standard (2-4 weeks, self-paced)',
      options: [
        'Crash course (1-3 days intensive)',
        'Standard (2-4 weeks, self-paced)',
        'Deep curriculum (1-2 months structured)',
      ],
    },
    {
      id: 'depth',
      field: 'depth',
      prompt: 'What target depth level are you aiming for?',
      recommended: 'Practical & Comprehensive',
      options: [
        'Foundational Overview (80/20 essentials)',
        'Practical & Comprehensive',
        'Rigorous & Theoretical',
        'System Design & Production-grade',
      ],
    },
    {
      id: 'preference',
      field: 'preference',
      prompt: 'What is your preferred pedagogical and visual style?',
      recommended: 'Project-based hands-on with visual whiteboard diagrams',
      options: [
        'Project-based hands-on with visual whiteboard diagrams',
        'Socratic dialogue and step-by-step proofs',
        'Bite-sized micro-lessons with frequent quizzes',
        'Case study driven with real-world breakdowns',
      ],
    },
  ];
}
