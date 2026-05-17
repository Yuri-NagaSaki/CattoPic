import { buildApiUrl, ensureApiBaseUrl } from "./baseUrl";

const API_KEY_KEY = "cattopic_api_key";
export const API_KEY_CHANGE_EVENT = "cattopic_api_key_change";

export const getApiKey = (): string | null => {
  if (typeof window !== "undefined") {
    return localStorage.getItem(API_KEY_KEY);
  }
  return null;
};

export const setApiKey = (apiKey: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(API_KEY_KEY, apiKey);
    window.dispatchEvent(new Event(API_KEY_CHANGE_EVENT));
  }
};

export const removeApiKey = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(API_KEY_KEY);
    window.dispatchEvent(new Event(API_KEY_CHANGE_EVENT));
  }
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  try {
    await ensureApiBaseUrl();
    const response = await fetch(buildApiUrl("/api/validate-api-key").toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Key validation failed:", {
        status: response.status,
        statusText: response.statusText,
        responseText: errorText
      });
      return false;
    }

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error("API Key validation error:", error);
    return false;
  }
};
