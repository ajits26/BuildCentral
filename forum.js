(async () => {
    const user = (await getUser()) || { id: null };
    if (!user.id) { $("threadForm").hidden = true; $("threadForm").before(loginPrompt("to start a thread.")); }
    const { data: cats } = await db.from("forum_categories").select("*").order("sort");
    (cats || []).forEach((c) => {
        $("fCategory").append(el("option", { value: c.id, textContent: c.name }));
        $("fFilter").append(el("option", { value: c.id, textContent: c.name }));
    });

    async function load() {
        let q = db.from("forum_threads")
            .select("id,title,created_at,forum_categories(name),profiles(name),forum_replies(count)")
            .order("last_activity", { ascending: false }).limit(50);
        if ($("fFilter").value !== "all") q = q.eq("category_id", $("fFilter").value);
        const { data } = await q;
        const box = $("threadList");
        box.textContent = "";
        if (!data || !data.length) box.append(el("p", { className: "page-intro", textContent: "No threads here yet. Start one." }));
        (data || []).forEach((t) => {
            const n = t.forum_replies && t.forum_replies[0] ? t.forum_replies[0].count : 0;
            box.append(el("div", { className: "content-card" },
                el("h2", {}, el("a", { href: "Thread.html?id=" + t.id, textContent: t.title })),
                el("p", { className: "post-meta", textContent:
                    (t.forum_categories ? t.forum_categories.name : "") + " - " +
                    (t.profiles ? t.profiles.name : "Member") + " - " +
                    new Date(t.created_at).toLocaleDateString() + " - " + n + (n === 1 ? " reply" : " replies") })));
        });
    }
    $("fFilter").addEventListener("change", load);

    $("threadForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { data, error } = await db.from("forum_threads").insert({
            category_id: Number($("fCategory").value), user_id: user.id,
            title: $("fTitle").value.trim(), body: $("fBody").value.trim()
        }).select().single();
        if (error) return setMessage("threadMsg", error.message, "error");
        window.location.href = "Thread.html?id=" + data.id;
    });
    load();
})();
