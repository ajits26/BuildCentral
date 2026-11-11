(async () => {
    const user = await getUser();
    if (!user) { $("allEvents").append(loginPrompt("to see events from the communities you've joined.")); return; }
    const box = $("allEvents");

    async function load() {
        const since = new Date(Date.now() - 864e5).toISOString();
        const { data } = await db.from("events")
            .select("*,communities(id,name),event_rsvps(user_id)")
            .gte("starts_at", since).order("starts_at");
        box.textContent = "";
        if (!data || !data.length) box.append(el("p", { className: "page-intro", textContent: "No upcoming events. Join a community to see its events here." }));
        (data || []).forEach((ev) => {
            const going = ev.event_rsvps.some((r) => r.user_id === user.id);
            const n = ev.event_rsvps.length;
            box.append(el("div", { className: "content-card" },
                el("h2", { textContent: ev.title }),
                el("p", { className: "post-meta" }, new Date(ev.starts_at).toLocaleString() + (ev.location ? " - " + ev.location : "") + " - ",
                    el("a", { href: "Community.html?id=" + ev.communities.id, textContent: ev.communities.name })),
                el("p", { className: "pre", textContent: ev.description || "" }),
                el("button", { type: "button", className: "small-btn", textContent: going ? "Going (cancel)" : "I'm going", onclick: async () => {
                    if (going) await db.from("event_rsvps").delete().eq("event_id", ev.id).eq("user_id", user.id);
                    else await db.from("event_rsvps").insert({ event_id: ev.id, user_id: user.id });
                    load();
                } }),
                el("span", { className: "post-meta", textContent: "  " + n + (n === 1 ? " person going" : " people going") })));
        });
    }
    load();
})();
