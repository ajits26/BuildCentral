(async () => {
    const user = await requireUser();
    if (!user) return;
    const T = { message: ["messages", "Chat message"], forum_thread: ["forum_threads", "Forum thread"], forum_reply: ["forum_replies", "Forum reply"], dm: ["direct_messages", "Direct message"], update: ["community_posts", "Community update"] };
    const box = $("reportList");

    async function resolve(id) {
        await db.from("reports").update({ resolved: true }).eq("id", id);
        load();
    }

    async function load() {
        const { data } = await db.from("reports").select("*,profiles(name),communities(name)")
            .eq("resolved", false).order("created_at", { ascending: false });
        box.textContent = "";
        if (!data || !data.length) box.append(el("p", { className: "page-intro", textContent: "No open reports." }));
        (data || []).forEach((r) => box.append(el("div", { className: "content-card" },
            el("h2", { textContent: T[r.kind][1] + (r.communities ? " in " + r.communities.name : "") }),
            el("p", { className: "post-meta", textContent: "Reported by " + (r.profiles ? r.profiles.name : "Member") + " on " + new Date(r.created_at).toLocaleString() }),
            el("p", { className: "pre", textContent: r.excerpt || "(no preview)" }),
            r.reason ? el("p", { textContent: "Reason: " + r.reason }) : "",
            r.kind === "dm" ? "" : el("button", { type: "button", className: "small-btn", textContent: "Delete content", onclick: async () => {
                const { error } = await db.from(T[r.kind][0]).delete().eq("id", r.target_id);
                if (error) return alert(error.message);
                resolve(r.id);
            } }),
            el("button", { type: "button", className: "small-btn", textContent: "Dismiss", onclick: () => resolve(r.id) }))));
    }
    load();
})();
