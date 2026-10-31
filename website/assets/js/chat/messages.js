


(() => {
  const API = () => window.RaseedAPI;

  const Messages = {
    async getAll(teamId) {
      if (!teamId) {
        throw new Error("اختر فريقًا أولًا لعرض محادثاته.");
      }

      if (!API()) {
        throw new Error("ملف apiClient.js غير محمّل.");
      }

      return API().get(
        `/teams/${encodeURIComponent(teamId)}/messages`
      );
    },

    async send(teamId, message, type = "text") {
      if (!teamId) {
        throw new Error("اختر الفريق الذي تريد إرسال الرسالة إليه.");
      }

      const text = String(message || "").trim();

      if (!text) {
        throw new Error("اكتب رسالة قبل الإرسال.");
      }

      if (!API()) {
        throw new Error("ملف apiClient.js غير محمّل.");
      }

      return API().post(
        `/teams/${encodeURIComponent(teamId)}/messages`,
        {
          message: text,
          type
        }
      );
    }
  };

  window.RaseedMessages = Messages;
})();
