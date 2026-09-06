import axios from 'axios';

const API_BASE = '/api/hyperknow';

export interface UserInfo {
  user_id: string;
  username: string;
  email: string;
  subscription: {
    tier: string;
    remaining_credits: number;
    max_credits: number;
  };
}

export interface Course {
  marketplaceId?: string;
  courseUuid?: string;
  courseTitle: string;
  courseDescription: string;
  targetLearner?: string;
  tags?: string[];
  unitCount?: number;
  sessionCount?: number;
  joinCount?: number;
  units?: any[];
}

export const api = {
  async getUserInfo(): Promise<UserInfo> {
    const res = await axios.get(`${API_BASE}/auth/get_user_info`);
    return res.data.data;
  },

  async getMarketplaceCourses(): Promise<Course[]> {
    const res = await axios.get(`${API_BASE}/marketplace/courses`);
    return res.data.courses;
  },

  async getConversations(): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/conversations/list_past_conversations`);
    return res.data.conversations || [];
  },

  async getDailyTrends(): Promise<any[]> {
    const res = await axios.get(`${API_BASE}/dailyTrends`);
    return res.data.trends?.hotspots || [];
  },

  async getTtsConfig(): Promise<any> {
    const res = await axios.get(`${API_BASE}/tts/config`);
    return res.data;
  }
};
