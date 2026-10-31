
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const teamSelect = document.getElementById("chatTeamSelect");
  const messagesContainer =
    document.getElementById("messagesList") ||
    document.getElementById("messagesContainer");
  const messageForm = document.getElementById("messageForm");
  const messageInput =
    document.getElementById("messageInput") ||
    document.getElementById("chatMessageInput");
  const errorBox = document.getElementById("chatError");

  let currentTeamId = null;
  let loading = false;

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message;
    } else {
      console.error(message);
    }
  }

  function getMessageText(message) {
    return (
      message.message ||
      message.content ||
      message.text ||
      ""
    );
  }

  function renderMessages(response) {
    if (!messagesContainer) return;

    const messages = Array.isArray(response)
      ? response
      : response.messages || response.data || [];

    messagesContainer.replaceChildren();

    if (!messages.length) {
      messagesContainer.textContent = "لا توجد رسائل في هذه المحادثة.";
      return;
    }

    messages.forEach((message) => {
      const item = document.createElement("article");
      item.className = "chat-message";

      const sender = document.createElement("strong");
      sender.textContent =
        message.senderName ||
        message.sender_name ||
        message.name ||
        message.userName ||
        "عضو الفريق";

      const content = document.createElement("p");
      content.textContent = getMessageText(message);

      item.append(sender, content);

      const timestamp =
        message.createdAt ||
        message.created_at ||
        message.sentAt;

      if (timestamp) {
        const time = document.createElement("small");
        const parsedDate = new Date(timestamp);

        time.textContent = Number.isNaN(parsedDate.getTime())
          ? String(timestamp)
          : parsedDate.toLocaleString("ar-SA");

        item.appendChild(time);
      }

      messagesContainer.appendChild(item);
    });
  }

  async function loadMessages(teamId) {
    if (!messagesContainer || !teamId || loading) return;

    loading = true;
    currentTeamId = String(teamId);
    showError("");
    messagesContainer.textContent = "جارٍ تحميل الرسائل...";

    try {
      const response = await window.RaseedMessages.getAll(teamId);

      // تجاهل النتائج القديمة إذا انتقل المستخدم إلى فريق آخر.
      if (currentTeamId !== String(teamId)) return;

      renderMessages(response);
    } catch (error) {
      console.error("Raseed messages error:", error);
      showError(error.message || "تعذر تحميل الرسائل.");
      messagesContainer.textContent = "تعذر تحميل المحادثة.";
    } finally {
      loading = false;
    }
  }

  if (teamSelect) {
    teamSelect.addEventListener("change", () => {
      const teamId = teamSelect.value;
      currentTeamId = teamId || null;

      if (teamId) {
        loadMessages(teamId);
      } else if (messagesContainer) {
        messagesContainer.textContent = "اختر فريقًا لعرض المحادثة.";
      }
    });
  }

  if (messageForm && messageInput) {
    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const teamId = teamSelect?.value || currentTeamId;
      const text = messageInput.value.trim();

      if (!teamId) {
        showError("اختر الفريق أولًا.");
        return;
      }

      if (!text) {
        showError("اكتب رسالة قبل الإرسال.");
        return;
      }

      const submitButton = messageForm.querySelector(
        'button[type="submit"]'
      );

      if (submitButton) submitButton.disabled = true;
      showError("");

      try {
        await window.RaseedMessages.send(teamId, text);
        messageInput.value = "";
        await loadMessages(teamId);
      } catch (error) {
        console.error("Raseed send message error:", error);
        showError(error.message || "تعذر إرسال الرسالة.");
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  document.addEventListener("raseed:login", () => {
    if (teamSelect?.value) {
      loadMessages(teamSelect.value);
    }
  });

  window.RaseedMessagesView = {
    load: loadMessages,
    refresh() {
      if (currentTeamId) loadMessages(currentTeamId);
    }
  };
});
