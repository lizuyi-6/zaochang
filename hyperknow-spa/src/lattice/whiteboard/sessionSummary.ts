export type SessionQuestionResult = 'correct' | 'partial' | 'incorrect' | 'unanswered';
export type SessionQuestionType = 'quick_check' | 'recall_check';

export interface SessionSummaryQuestion {
  stepId: string;
  type: SessionQuestionType;
  question: string;
  result: SessionQuestionResult;
  correctAnswer: string;
}

export interface SessionSummaryResponse {
  sessionId?: string;
  questions: SessionSummaryQuestion[];
  questionCount: number;
  answeredCount: number;
  firstTryScore: number;
  maxScore: number;
  course?: {
    status: 'notStarted' | 'started' | 'completed';
    masteryLevel: 'notStarted' | 'attempted' | 'familiar' | 'proficient' | 'mastered';
    nextLecture: { unitId: string; lectureId: string; title: string } | null;
  };
}

export type ClientCheckQuestions = readonly Omit<SessionSummaryQuestion, 'result'>[];

/** 未落库时保留客户端结果；服务端已有首答时以数据库值覆盖客户端反馈。 */
export function mergeSessionSummary(
  clientQuestions: ClientCheckQuestions,
  clientResults: Readonly<Record<string, SessionQuestionResult>>,
  server?: SessionSummaryResponse | null,
): SessionSummaryResponse {
  const clientById = new Map(clientQuestions.map((question) => [question.stepId, question]));
  const questions = server
    ? server.questions.map((question) => {
        const client = clientById.get(question.stepId);
        return {
          ...question,
          question: question.question || client?.question || '',
          correctAnswer: question.correctAnswer || client?.correctAnswer || '',
          result: question.result === 'unanswered'
            ? clientResults[question.stepId] ?? question.result
            : question.result,
        };
      })
    : clientQuestions.map((question) => ({
        ...question,
        result: clientResults[question.stepId] ?? 'unanswered',
      }));

  if (server) {
    const serverIds = new Set(server.questions.map((question) => question.stepId));
    for (const question of clientQuestions) {
      if (serverIds.has(question.stepId)) continue;
      questions.push({
        ...question,
        result: clientResults[question.stepId] ?? 'unanswered',
      });
    }
  }

  const answeredCount = questions.filter((question) => question.result !== 'unanswered').length;
  const firstTryScore = questions.reduce((score, question) => {
    if (question.result === 'correct') return score + 1;
    if (question.result === 'partial') return score + 0.5;
    return score;
  }, 0);

  return {
    ...(server?.sessionId ? { sessionId: server.sessionId } : {}),
    questions,
    questionCount: questions.length,
    answeredCount,
    firstTryScore,
    maxScore: questions.length,
    ...(server?.course ? { course: server.course } : {}),
  };
}
