(async () => {
    const user = (await getUser()) || { id: null };
    const cid = new URLSearchParams(location.search).get("id");
    const { data: c } = await db.from("communities").select("*").eq("id", cid).maybeSingle();
    if (!c) { $("cTitle").textContent = "Community not found"; return; }
    const TYPES = { high_school: "High school", collegiate: "Collegiate", local: "Local" };
    $("cTitle").textContent = c.name;
    $("cMeta").textContent = TYPES[c.type];
    $("cDesc").textContent = c.description || "";
    $("teamLink").href = "Team.html?id=" + cid;
    let role = null, channel = null, roles = [], memberRoles = [], chRoles = [], replyTo = null;
    const isAdmin = () => role === "admin";

    async function uploadImage(file, bucket = "chat-images") {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
            alert("Choose a JPG, PNG, WebP or GIF under 5 MB.");
            return null;
        }
        const path = cid + "/" + crypto.randomUUID() + "." + file.type.split("/")[1];
        const { error } = await db.storage.from(bucket).upload(path, file);
        if (error) { alert(error.message); return null; }
        return path;
    }

    async function report(kind, target, text) {
        if (!user.id) return goLogin();
        const reason = prompt("Why are you reporting this? (optional)");
        if (reason === null) return;
        const { error } = await db.from("reports").insert({ reporter_id: user.id, community_id: cid, kind, target_id: target, reason, excerpt: String(text).slice(0, 500) });
        alert(error ? error.message : "Thanks, the admins will review it.");
    }

    async function refresh() {
        const { data } = !user.id ? { data: null } : await db.from("memberships").select("role").eq("community_id", cid).eq("user_id", user.id).maybeSingle();
        role = data ? data.role : null;
        if (!role && !user.id) {
            $("joinBtn").textContent = "Log in to join";
        } else if (!role) {
            const { data: rq } = await db.from("join_requests").select("user_id").eq("community_id", cid).eq("user_id", user.id).maybeSingle();
            $("joinBtn").textContent = rq ? "Request pending" : (c.requires_approval ? "Request to join" : "Join community");
            $("joinBtn").disabled = !!rq;
        }
        $("joinBox").hidden = !!role;
        document.querySelectorAll(".member-only").forEach((x) => (x.hidden = !role));
        $("leaveBtn").hidden = !role;
        document.querySelectorAll(".panel").forEach((p) => (p.hidden = true));
        document.querySelectorAll(".admin-only").forEach((x) => (x.hidden = !isAdmin()));
        showTab("updates"); loadUpdates(); loadMembers();
        if (role) { loadRoles().then(() => { loadChannels(); loadMembers(); }); loadEvents(); loadRequests(); }
    }

    function showTab(name) {
        document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    }
    document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    document.querySelectorAll(".admin-only").forEach((x) => (x.hidden = true));

    $("joinBtn").onclick = async () => {
        if (!user.id) return goLogin();
        const { error } = c.requires_approval
            ? await db.from("join_requests").insert({ community_id: cid, user_id: user.id })
            : await db.from("memberships").insert({ community_id: cid, user_id: user.id, role: "member" });
        if (error) alert(error.message);
        refresh();
    };
    $("leaveBtn").onclick = async () => {
        if (!confirm("Leave this community?")) return;
        const { error } = await db.from("memberships").delete().eq("community_id", cid).eq("user_id", user.id);
        if (error) return alert(error.message.includes("last admin") ? "You are the only admin. Make someone else an admin first." : error.message);
        window.location.href = "Communities.html";
    };

    // ----- Chat -----
    async function loadChannels() {
        const { data } = await db.from("channels").select("*").eq("community_id", cid).order("name");
        const chs = data || [];
        const ids = chs.map((x) => x.id);
        const { data: cr } = ids.length ? await db.from("channel_roles").select("channel_id,role_id").in("channel_id", ids) : { data: [] };
        chRoles = cr || [];
        if (!channel || !chs.find((x) => x.id === channel.id)) channel = chs[0] || null;
        const box = $("channelList");
        box.textContent = "";
        chs.forEach((ch) => box.append(el("button", {
            type: "button", textContent: (chRoles.some((x) => x.channel_id === ch.id) ? "🔒 " : "# ") + ch.name,
            className: "channel-btn" + (channel && channel.id === ch.id ? " active" : ""),
            onclick: () => { channel = ch; clearReply(); loadChannels(); }
        })));
        $("channelName").textContent = channel ? "# " + channel.name : "";
        renderAccess();
        loadMessages();
    }

    async function loadMessages() {
        if (!channel) return;
        const { data } = await db.from("messages").select("id,body,created_at,user_id,image_path,reply_to,profiles(name,avatar_url)")
            .eq("channel_id", channel.id).order("created_at").limit(200);
        const paths = (data || []).filter((m) => m.image_path).map((m) => m.image_path);
        const urls = {};
        if (paths.length) {
            const { data: signed } = await db.storage.from("chat-images").createSignedUrls(paths, 3600);
            (signed || []).forEach((x) => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
        }
        const byId = {};
        (data || []).forEach((x) => (byId[x.id] = x));
        const box = $("messages");
        box.textContent = "";
        (data || []).forEach((m) => {
            const parent = m.reply_to ? byId[m.reply_to] : null;
            const row = el("div", { className: "msg" },
                avatar(m.profiles && m.profiles.avatar_url), el("strong", { textContent: m.profiles ? m.profiles.name : "Member" }),
                el("span", { className: "post-meta", textContent: "  " + new Date(m.created_at).toLocaleString() }),
                m.reply_to ? el("div", { className: "quote", textContent: parent ? (parent.profiles ? parent.profiles.name : "Member") + ": " + parent.body.slice(0, 120) : "Replying to an earlier message" }) : "",
                el("p", { textContent: m.body }));
            if (m.image_path && urls[m.image_path]) row.append(el("img", { src: urls[m.image_path], className: "chat-img", alt: "Shared photo" }));
            row.append(el("button", { type: "button", className: "small-btn", textContent: "Reply", onclick: () => setReply(m) }));
            if (m.user_id !== user.id) row.append(el("button", { type: "button", className: "small-btn", textContent: "Report", onclick: () => report("message", m.id, m.body) }));
            if (m.user_id === user.id || isAdmin()) row.append(el("button", {
                type: "button", className: "small-btn", textContent: "Delete",
                onclick: async () => { await db.from("messages").delete().eq("id", m.id); loadMessages(); }
            }));
            box.append(row);
        });
        box.scrollTop = box.scrollHeight;
    }

    $("sendForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = $("msgInput").value.trim();
        const file = $("msgFile").files[0];
        if ((!body && !file) || !channel) return;
        let image_path = null;
        if (file) { image_path = await uploadImage(file); if (!image_path) return; }
        await db.from("messages").insert({ channel_id: channel.id, user_id: user.id, body: body || "(photo)", image_path, reply_to: replyTo ? replyTo.id : null });
        $("msgInput").value = "";
        $("msgFile").value = "";
        clearReply();
        loadMessages();
    });

    $("channelForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await db.from("channels").insert({ community_id: cid, name: $("channelInput").value.trim(), created_by: user.id });
        setMessage("channelMsg", error ? "Couldn't create that channel (name already used?)" : "", "error");
        if (!error) { $("channelInput").value = ""; loadChannels(); }
    });

    db.channel("room-" + cid).on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadMessages()).subscribe();

    // ----- Events -----
    async function loadEvents() {
        const since = new Date(Date.now() - 864e5).toISOString();
        const { data } = await db.from("events").select("*").eq("community_id", cid).gte("starts_at", since).order("starts_at");
        const box = $("eventList");
        box.textContent = "";
        if (!data || !data.length) box.append(el("p", { className: "page-intro", textContent: "No upcoming events." }));
        (data || []).forEach((ev) => {
            const card = el("div", { className: "content-card" },
                el("h2", { textContent: ev.title }),
                el("p", { className: "post-meta", textContent: new Date(ev.starts_at).toLocaleString() + (ev.location ? " - " + ev.location : "") }),
                el("p", { textContent: ev.description || "" }));
            if (isAdmin()) card.append(el("button", {
                type: "button", className: "small-btn", textContent: "Delete event",
                onclick: async () => { await db.from("events").delete().eq("id", ev.id); loadEvents(); }
            }));
            box.append(card);
        });
    }

    $("eventForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await db.from("events").insert({
            community_id: cid, created_by: user.id, title: $("evTitle").value.trim(),
            starts_at: new Date($("evTime").value).toISOString(),
            location: $("evPlace").value.trim(), description: $("evDesc").value.trim()
        });
        setMessage("eventMsg", error ? error.message : "Event added.", error ? "error" : "success");
        if (!error) { e.target.reset(); loadEvents(); }
    });

    // ----- Members -----
    function clearReply() { replyTo = null; $("replyBar").hidden = true; }
    function setReply(m) {
        replyTo = m;
        const bar = $("replyBar");
        bar.hidden = false;
        bar.textContent = "";
        bar.append("Replying to " + (m.profiles ? m.profiles.name : "Member") + ": " + m.body.slice(0, 80) + " ",
            el("button", { type: "button", className: "chip-x", textContent: "x", title: "Cancel reply", onclick: clearReply }));
        $("msgInput").focus();
    }

    async function loadRoles() {
        const { data } = await db.from("roles").select("*").eq("community_id", cid).order("name");
        roles = data || [];
        const box = $("roleBox");
        box.textContent = "";
        box.append(el("h2", { textContent: "Roles" }),
            el("p", { className: "post-meta", textContent: "Create roles like Officers or Build Team, assign them to members below, then limit channels to those roles in Chat." }));
        roles.forEach((r) => box.append(el("span", { className: "chip" }, r.name, el("button", {
            type: "button", className: "chip-x", textContent: "x", title: "Delete role",
            onclick: async () => {
                if (!confirm('Delete the role "' + r.name + '"?')) return;
                const { error } = await db.from("roles").delete().eq("id", r.id);
                if (error) return alert("Remove this role from every channel first.");
                await loadRoles(); loadChannels(); loadMembers();
            }
        }))));
        const inp = el("input", { type: "text", placeholder: "New role name", maxLength: 30 });
        box.append(el("div", { className: "inline-form" }, inp, el("button", {
            type: "button", className: "small-btn", textContent: "Add role",
            onclick: async () => {
                const name = inp.value.trim();
                if (!name) return;
                const { error } = await db.from("roles").insert({ community_id: cid, name });
                if (error) return alert("Couldn't create that role (name already used?)");
                loadRoles();
            }
        })));
    }

    function renderAccess() {
        const box = $("accessBox");
        box.textContent = "";
        if (!channel || !isAdmin()) return;
        const on = chRoles.filter((x) => x.channel_id === channel.id).map((x) => x.role_id);
        box.append(el("p", { className: "post-meta", textContent: on.length ? "Private. Visible to admins and members with the checked roles:" : "Visible to every member. Check roles to make it private:" }));
        if (!roles.length) box.append(el("p", { className: "post-meta", textContent: "Create roles in the Members tab first." }));
        roles.forEach((r) => {
            const cb = el("input", { type: "checkbox", checked: on.includes(r.id), onchange: async () => {
                const { error } = cb.checked
                    ? await db.from("channel_roles").insert({ channel_id: channel.id, role_id: r.id })
                    : await db.from("channel_roles").delete().eq("channel_id", channel.id).eq("role_id", r.id);
                if (error) alert(error.message);
                loadChannels();
            } });
            box.append(el("label", { className: "check-row" }, cb, r.name));
        });
    }

    function roleChips(m) {
        const has = memberRoles.filter((x) => x.user_id === m.user_id).map((x) => x.role_id);
        const out = roles.filter((r) => has.includes(r.id)).map((r) => el("span", { className: "chip" }, r.name,
            isAdmin() ? el("button", { type: "button", className: "chip-x", textContent: "x", title: "Remove role", onclick: async () => {
                await db.from("member_roles").delete().eq("user_id", m.user_id).eq("role_id", r.id);
                loadMembers(); loadChannels();
            } }) : ""));
        const free = roles.filter((r) => !has.includes(r.id));
        if (isAdmin() && free.length) {
            const sel = el("select", { className: "role-select", onchange: async () => {
                if (!sel.value) return;
                const { error } = await db.from("member_roles").insert({ community_id: cid, user_id: m.user_id, role_id: sel.value });
                if (error) alert(error.message);
                loadMembers();
            } }, el("option", { value: "", textContent: "+ role" }), ...free.map((r) => el("option", { value: r.id, textContent: r.name })));
            out.push(sel);
        }
        return out;
    }

    async function loadMembers() {
        if (!user.id) { const b = $("memberList"); b.textContent = ""; b.append(loginPrompt("to see this team's members.")); return; }
        const { data } = await db.from("memberships").select("user_id,role,profiles(name,avatar_url)").eq("community_id", cid).order("role");
        const { data: mr } = await db.from("member_roles").select("user_id,role_id").eq("community_id", cid);
        memberRoles = mr || [];
        const box = $("memberList");
        box.textContent = "";
        (data || []).forEach((m) => {
            const row = el("div", { className: "member-row" },
                el("span", {}, avatar(m.profiles && m.profiles.avatar_url), (m.profiles ? m.profiles.name : "Member") + (m.role === "admin" ? "  (admin)" : ""), ...roleChips(m)));
            if (m.user_id !== user.id) row.append(el("a", { className: "small-btn", href: "Messages.html?to=" + m.user_id, textContent: "Message" }));
            if (isAdmin() && m.user_id !== user.id) {
                if (m.role === "member") row.append(el("button", {
                    type: "button", className: "small-btn", textContent: "Make admin",
                    onclick: async () => { await db.from("memberships").update({ role: "admin" }).eq("community_id", cid).eq("user_id", m.user_id); loadMembers(); }
                }));
                row.append(el("button", {
                    type: "button", className: "small-btn", textContent: "Remove",
                    onclick: async () => { await db.from("memberships").delete().eq("community_id", cid).eq("user_id", m.user_id); loadMembers(); }
                }));
            }
            box.append(row);
        });
    }

    async function loadRequests() {
        if (!isAdmin()) return;
        const { data } = await db.from("join_requests").select("user_id,profiles(name)").eq("community_id", cid);
        const box = $("requestBox");
        box.textContent = "";
        if (!data || !data.length) return box.append(el("p", { textContent: "No pending join requests." }));
        box.append(el("h2", { textContent: "Join requests" }));
        data.forEach((r) => box.append(el("div", { className: "member-row" },
            el("span", { textContent: r.profiles ? r.profiles.name : "Member" }),
            el("span", {},
                el("button", { type: "button", className: "small-btn", textContent: "Approve", onclick: async () => {
                    const { error } = await db.rpc("approve_request", { cid, uid: r.user_id });
                    if (error) alert(error.message);
                    loadRequests(); loadMembers();
                } }),
                el("button", { type: "button", className: "small-btn", textContent: "Decline", onclick: async () => {
                    await db.from("join_requests").delete().eq("community_id", cid).eq("user_id", r.user_id);
                    loadRequests();
                } })))));
    }

    $("renameChannel").onclick = async () => {
        if (!channel) return;
        const name = prompt("New channel name", channel.name);
        if (!name) return;
        const { error } = await db.from("channels").update({ name: name.trim() }).eq("id", channel.id);
        if (error) alert(error.message); else loadChannels();
    };
    $("deleteChannel").onclick = async () => {
        if (!channel || !confirm("Delete #" + channel.name + " and all its messages?")) return;
        await db.from("channels").delete().eq("id", channel.id);
        channel = null;
        loadChannels();
    };
    $("editCommunity").onclick = async () => {
        const name = prompt("Community name", c.name);
        if (!name) return;
        const description = prompt("Description", c.description || "");
        if (description === null) return;
        const { error } = await db.from("communities").update({ name: name.trim(), description: description.trim() }).eq("id", cid);
        if (error) alert(error.message); else location.reload();
    };
    $("deleteCommunity").onclick = async () => {
        if (!confirm("Delete this community and everything in it? This can't be undone.")) return;
        await db.from("communities").delete().eq("id", cid);
        location.href = "Communities.html";
    };

    async function loadUpdates() {
        const { data } = await db.from("community_posts").select("*,profiles(name)")
            .eq("community_id", cid).order("created_at", { ascending: false }).limit(50);
        const box = $("updateList");
        box.textContent = "";
        if (!data || !data.length) box.append(el("p", { className: "page-intro", textContent: "No updates yet." }));
        (data || []).forEach((p) => {
            const card = el("div", { className: "content-card" },
                el("h2", { textContent: p.title }),
                el("p", { className: "post-meta", textContent: (p.profiles ? p.profiles.name : "Admin") + " - " + new Date(p.created_at).toLocaleDateString() }),
                el("p", { className: "pre", textContent: p.body }));
            if (p.image_path) card.append(el("img", { src: db.storage.from("update-images").getPublicUrl(p.image_path).data.publicUrl, className: "chat-img", alt: p.title }));
            if (isAdmin()) card.append(el("button", { type: "button", className: "small-btn", textContent: "Delete update", onclick: async () => {
                await db.from("community_posts").delete().eq("id", p.id);
                loadUpdates();
            } }));
            else card.append(el("button", { type: "button", className: "small-btn", textContent: "Report", onclick: async () => {
                if (!user.id) return goLogin();
                const reason = prompt("Why are you reporting this? (optional)");
                if (reason === null) return;
                const { error } = await db.from("reports").insert({ reporter_id: user.id, kind: "update", target_id: p.id, reason, excerpt: (p.title + ": " + p.body).slice(0, 500) });
                alert(error ? error.message : "Thanks, a moderator will review it.");
            } }));
            box.append(card);
        });
    }

    $("updateForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const file = $("upFile").files[0];
        let image_path = null;
        if (file) { image_path = await uploadImage(file, "update-images"); if (!image_path) return; }
        const { error } = await db.from("community_posts").insert({
            community_id: cid, user_id: user.id, title: $("upTitle").value.trim(), body: $("upBody").value.trim(), image_path
        });
        setMessage("updateMsg", error ? error.message : "Update posted.", error ? "error" : "success");
        if (!error) { e.target.reset(); loadUpdates(); }
    });

    refresh();
})();
