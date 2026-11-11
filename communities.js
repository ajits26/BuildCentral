const TYPES = { high_school: "High school", collegiate: "Collegiate", local: "Local" };
(async () => {
    const user = await getUser();
    let all = [];
    if (!user) {
        const box = document.querySelector(".create-box");
        box.hidden = true;
        box.after(loginPrompt("to start or join a community."));
    }
    const list = $("communityList");

    function render() {
        const f = $("filter").value;
        list.textContent = "";
        const shown = all.filter((c) => f === "all" || c.type === f);
        if (!shown.length) list.append(el("p", { className: "page-intro", textContent: "No communities yet. Create the first one." }));
        shown.forEach((c) => list.append(el("div", { className: "team-card" },
            el("h3", { textContent: c.name }),
            el("p", { textContent: TYPES[c.type] + (c.description ? " - " + c.description : "") }),
            el("a", { href: "Team.html?id=" + c.id, textContent: "Team page" }),
            el("a", { href: "Community.html?id=" + c.id, textContent: "Open" }))));
    }

    const { data } = await db.from("communities").select("*").order("created_at", { ascending: false });
    all = data || [];
    render();
    $("filter").addEventListener("change", render);

    $("createForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { data: c, error } = await db.from("communities").insert({
            name: $("cName").value.trim(), type: $("cType").value,
            description: $("cDesc").value.trim(), requires_approval: $("cApproval").checked, created_by: user.id
        }).select().single();
        if (error) return setMessage("createMessage", error.message, "error");
        window.location.href = "Community.html?id=" + c.id;
    });

    const { data: mine } = !user ? { data: null } : await db.from("memberships").select("role,communities(id,name,type)").eq("user_id", user.id);
    if (mine && mine.length) {
        $("mine").hidden = false;
        mine.forEach((m) => $("myList").append(el("div", { className: "team-card" },
            el("h3", { textContent: m.communities.name }),
            el("p", { textContent: TYPES[m.communities.type] + (m.role === "admin" ? " - you are an admin" : "") }),
            el("a", { href: "Team.html?id=" + m.communities.id, textContent: "Team page" }),
            el("a", { href: "Community.html?id=" + m.communities.id, textContent: "Open" }))));
    }
})();
