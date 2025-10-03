import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { ApiError } from '@/types/auth';
import { BackendErrorResponse } from '@/types/response';
import { getSession, signOut } from 'next-auth/react';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
      timeout: 600000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        // Get token from NextAuth session
        const session = await getSession();

        if (session?.accessToken) {
          config.headers.Authorization = `Bearer ${session.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        // Get the actual backend response data
        // const backendResponse = error.response?.data;
        const backendResponse = error.response?.data as BackendErrorResponse | undefined;
        const requestUrl = error.config?.url;

        // Extract the message from backend response or use Axios error message
        const message =
          backendResponse?.message ||
          backendResponse?.error ||
          backendResponse?.detail ||
          error.message ||
          'An error occurred';

        const apiError: ApiError = {
          message: message,
          status: error.response?.status || 500,
          // Preserve the full backend response for debugging
          response: backendResponse,
        };

        // Handle unauthorized errors
        if (apiError.status === 401 && !requestUrl?.includes('/auth/login')) {
          await signOut();
          window.location.href = '/auth/login';
        }

        return Promise.reject(apiError);
      }
    );
  }

  async get<T>(url: string, config?: object): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async postFormData<T>(url: string, formData: FormData): Promise<T> {
    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
