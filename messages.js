(async () => {
    const user = await requireUser();
    if (!user) return;
    const UUID = /^[0-9a-f-]{36}$/i;
    const to = new URLSearchParams(location.search).get("to");
    let current = to && UUID.test(to) ? to : null;
    const names = {};

    async function nameOf(ids) {
        const need = ids.filter((i) => !names[i]);
        if (!need.length) return;
        const { data } = await db.from("profiles").select("id,name").in("id", need);
        (data || []).forEach((p) => (names[p.id] = p.name));
    }

    async function loadList() {
        const { data } = await db.from("direct_messages").select("sender_id,recipient_id")
            .order("created_at", { ascending: false }).limit(500);
        const order = [];
        (data || []).forEach((m) => {
            const o = m.sender_id === user.id ? m.recipient_id : m.sender_id;
            if (!order.includes(o)) order.push(o);
        });
        if (current && !order.includes(current)) order.unshift(current);
        await nameOf(order);
        const box = $("people");
        box.textContent = "";
        if (!order.length) box.append(el("p", { className: "post-meta", textContent: "No conversations yet. Open a community's Members tab and press Message." }));
        order.forEach((id) => box.append(el("button", {
            type: "button", textContent: names[id] || "Member",
            className: "channel-btn" + (id === current ? " active" : ""),
            onclick: () => { current = id; loadList(); loadThread(); }
        })));
    }

    async function loadThread() {
        $("threadPane").hidden = !current;
        if (!current) return;
        $("withName").textContent = names[current] || "Member";
        const { data } = await db.from("direct_messages").select("*")
            .or("and(sender_id.eq." + user.id + ",recipient_id.eq." + current + "),and(sender_id.eq." + current + ",recipient_id.eq." + user.id + ")")
            .order("created_at").limit(300);
        const box = $("dmMessages");
        box.textContent = "";
        (data || []).forEach((m) => {
            const mine = m.sender_id === user.id;
            const row = el("div", { className: "msg" },
                el("strong", { textContent: mine ? "You" : names[current] || "Member" }),
                el("span", { className: "post-meta", textContent: "  " + new Date(m.created_at).toLocaleString() }),
                el("p", { textContent: m.body }));
            if (!mine) row.append(el("button", { type: "button", className: "small-btn", textContent: "Report", onclick: async () => {
                const reason = prompt("Why are you reporting this? (optional)");
                if (reason === null) return;
                const { error } = await db.from("reports").insert({ reporter_id: user.id, kind: "dm", target_id: m.id, reason, excerpt: m.body.slice(0, 500) });
                alert(error ? error.message : "Thanks, a moderator will review it.");
            } }));
            box.append(row);
        });
        box.scrollTop = box.scrollHeight;
    }

    $("dmForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = $("dmInput").value.trim();
        if (!body || !current) return;
        const { error } = await db.from("direct_messages").insert({ sender_id: user.id, recipient_id: current, body });
        if (error) return setMessage("dmError", "This person isn't accepting messages from outside their communities.", "error");
        setMessage("dmError", "");
        $("dmInput").value = "";
        loadList();
        loadThread();
    });

    db.channel("dm-" + user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" },
        () => { loadList(); loadThread(); }).subscribe();

    await loadList();
    loadThread();
})();
