


(() => {
  const API_BASE = "/api";

  async function request(path, options = {}) {
    const token = localStorage.getItem("app_token");

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
      });
    } catch (error) {
      throw new Error(
        "تعذر الاتصال بالسيرفر. تأكد أن السيرفر يعمل وأن الموقع مفتوح من localhost:3000."
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("app_token");
        localStorage.removeItem("app_user");
      }

      throw new Error(
        data.message || `حدث خطأ في الطلب (${response.status})`
      );
    }

    return data;
  }

  window.RaseedAPI = {
    get(path) {
      return request(path, { method: "GET" });
    },

    post(path, body = {}) {
      return request(path, {
        method: "POST",
        body: JSON.stringify(body)
      });
    },

    put(path, body = {}) {
      return request(path, {
        method: "PUT",
        body: JSON.stringify(body)
      });
    },

    delete(path) {
      return request(path, { method: "DELETE" });
    }
  };
})();
