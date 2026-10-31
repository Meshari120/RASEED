
"use strict";

(() => {
  const API = () => window.RaseedAPI;

  const Teams = {
    async getAll() {
      if (!API()) {
        throw new Error("ملف apiClient.js غير محمّل.");
      }

      return API().get("/teams");
    },

    async getById(teamId) {
      if (!teamId) {
        throw new Error("معرّف الفريق غير موجود.");
      }

      return API().get(`/teams/${encodeURIComponent(teamId)}`);
    },

    async create(teamData) {
      if (!API()) {
        throw new Error("ملف apiClient.js غير محمّل.");
      }

      return API().post("/teams", teamData);
    },

    async join(teamId) {
      if (!teamId) {
        throw new Error("معرّف الفريق غير موجود.");
      }

      return API().post(
        `/teams/${encodeURIComponent(teamId)}/join`
      );
    },

    async leave(teamId) {
      if (!teamId) {
        throw new Error("معرّف الفريق غير موجود.");
      }

      return API().post(
        `/teams/${encodeURIComponent(teamId)}/leave`
      );
    }
  };

  window.RaseedTeams = Teams;
})();
