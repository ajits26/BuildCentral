(async () => {
    const user = (await getUser()) || { id: null };
    if (!user.id) { $("replyForm").hidden = true; $("replyForm").before(loginPrompt("to reply.")); }
    const id = new URLSearchParams(location.search).get("id");
    const { data: me } = !user.id ? { data: null } : await db.from("profiles").select("is_site_admin").eq("id", user.id).maybeSingle();
    const admin = !!(me && me.is_site_admin);
    async function report(kind, target, text) {
        if (!user.id) return goLogin();
        const reason = prompt("Why are you reporting this? (optional)");
        if (reason === null) return;
        const { error } = await db.from("reports").insert({ reporter_id: user.id, kind, target_id: target, reason, excerpt: String(text).slice(0, 500) });
        alert(error ? error.message : "Thanks, a moderator will review it.");
    }
    const { data: t } = await db.from("forum_threads").select("*,profiles(name),forum_categories(name)").eq("id", id).maybeSingle();
    if (!t) { $("tTitle").textContent = "Thread not found"; $("replyForm").hidden = true; return; }

    $("tTitle").textContent = t.title;
    $("tMeta").textContent = (t.forum_categories ? t.forum_categories.name : "") + " - " +
        (t.profiles ? t.profiles.name : "Member") + " - " + new Date(t.created_at).toLocaleString();
    $("tBody").textContent = t.body;
    if (t.user_id !== user.id) { $("tReport").hidden = false; $("tReport").onclick = () => report("forum_thread", t.id, t.title + ": " + t.body); }
    if (t.user_id === user.id || admin) {
        $("tDelete").hidden = false;
        $("tDelete").onclick = async () => {
            if (!confirm("Delete this thread and all replies?")) return;
            await db.from("forum_threads").delete().eq("id", id);
            window.location.href = "Forum.html";
        };
    }

    async function loadReplies() {
        const { data } = await db.from("forum_replies").select("*,profiles(name)").eq("thread_id", id).order("created_at");
        const box = $("replyList");
        box.textContent = "";
        (data || []).forEach((r) => {
            const card = el("div", { className: "content-card" },
                el("strong", { textContent: r.profiles ? r.profiles.name : "Member" }),
                el("span", { className: "post-meta", textContent: "  " + new Date(r.created_at).toLocaleString() }),
                el("p", { className: "pre", textContent: r.body }));
            if (r.user_id !== user.id) card.append(el("button", { type: "button", className: "small-btn", textContent: "Report", onclick: () => report("forum_reply", r.id, r.body) }));
            if (r.user_id === user.id || admin) card.append(el("button", {
                type: "button", className: "small-btn", textContent: "Delete",
                onclick: async () => { await db.from("forum_replies").delete().eq("id", r.id); loadReplies(); }
            }));
            box.append(card);
        });
    }

    $("replyForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await db.from("forum_replies").insert({ thread_id: id, user_id: user.id, body: $("rBody").value.trim() });
        if (error) return setMessage("replyMsg", error.message, "error");
        $("rBody").value = "";
        loadReplies();
    });
    loadReplies();
})();
