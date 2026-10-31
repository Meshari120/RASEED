
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const teamsContainer =
    document.getElementById("teamsList") ||
    document.getElementById("teamsContainer");

  const refreshButton = document.getElementById("refreshTeamsBtn");

  async function loadTeams() {
    if (!teamsContainer) {
      console.warn(
        "Raseed: لم يتم العثور على teamsList أو teamsContainer في index.html"
      );
      return;
    }

    teamsContainer.textContent = "جارٍ تحميل الفرق...";

    try {
      if (!window.RaseedTeams) {
        throw new Error("ملف teams.js غير محمّل.");
      }

      const response = await window.RaseedTeams.getAll();

      const teams = Array.isArray(response)
        ? response
        : response.teams || response.data || [];

      if (!Array.isArray(teams) || teams.length === 0) {
        teamsContainer.textContent = "لا توجد فرق لعرضها حاليًا.";
        return;
      }

      teamsContainer.replaceChildren();

      teams.forEach((team) => {
        const card = document.createElement("article");
        card.className = "team-card";

        const title = document.createElement("h3");
        title.textContent = team.name || team.team_name || "فريق جديد";

        const description = document.createElement("p");
        description.textContent =
          team.description || team.about || "لا يوجد وصف للفريق.";

        const members = document.createElement("p");
        const memberCount =
          team.memberCount ?? team.member_count ?? team.members_count;

        members.textContent =
          memberCount === undefined
            ? ""
            : `عدد الأعضاء: ${memberCount}`;

        card.append(title, description, members);
        teamsContainer.appendChild(card);
      });
    } catch (error) {
      console.error("Raseed teams error:", error);
      teamsContainer.textContent =
        error.message || "تعذر تحميل الفرق.";
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", loadTeams);
  }

  document.addEventListener("raseed:login", loadTeams);

  window.RaseedTeamsView = {
    load: loadTeams
  };
});
