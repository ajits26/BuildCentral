(async () => {
    const cid = new URLSearchParams(location.search).get("id");
    const user = await getUser();
    const { data: c } = await db.from("communities").select("*").eq("id", cid).maybeSingle();
    if (!c) { $("tName").textContent = "Team not found"; return; }

    const TYPES = { high_school: "High school team", collegiate: "Collegiate team", local: "Local group" };
    const pub = (p) => db.storage.from("update-images").getPublicUrl(p).data.publicUrl;
    const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "");
    document.title = c.name + " | LaunchCentral";
    $("tType").textContent = TYPES[c.type];
    $("tName").textContent = c.name;
    $("tTagline").textContent = c.tagline || c.description || "";
    if (c.cover_path) $("hero").style.backgroundImage = 'linear-gradient(rgba(10,20,36,.6), rgba(10,20,36,.93)), url("' + pub(c.cover_path) + '")';
    $("tAbout").textContent = c.about || c.description || "This team hasn't written its About section yet.";

    let role = null;
    if (user) {
        const { data: m } = await db.from("memberships").select("role").eq("community_id", cid).eq("user_id", user.id).maybeSingle();
        role = m ? m.role : null;
    }
    const isAdmin = role === "admin";
    $("joinLink").href = user ? "Community.html?id=" + cid : "Register.html";
    $("joinLink").textContent = role ? "Open team space" : user ? "Join this team" : "Sign up to join";

    const site = safeUrl(c.website);
    if (c.contact || site) {
        $("contactSec").hidden = false;
        $("tContact").textContent = c.contact || "";
        if (site) { $("tWebsite").href = site; $("tWebsite").textContent = "Visit our website"; $("tWebsite").hidden = false; }
    }

    async function loadMilestones() {
        const { data } = await db.from("team_highlights").select("*").eq("community_id", cid).order("created_at");
        const box = $("milestones");
        box.textContent = "";
        $("milestonesSec").hidden = !(data && data.length) && !isAdmin;
        (data || []).forEach((h) => {
            const card = el("div", { className: "content-card milestone" },
                el("p", { className: "when", textContent: h.when_text }),
                el("h2", { textContent: h.title }),
                el("p", { textContent: h.detail }));
            if (isAdmin) card.append(el("button", { type: "button", className: "small-btn", textContent: "Remove", onclick: async () => {
                await db.from("team_highlights").delete().eq("id", h.id);
                loadMilestones();
            } }));
            box.append(card);
        });
    }

    const { data: posts } = await db.from("community_posts").select("*").eq("community_id", cid)
        .order("created_at", { ascending: false }).limit(30);
    const ub = $("updates");
    if (!posts || !posts.length) ub.append(el("p", { className: "page-intro", textContent: "No updates posted yet." }));
    (posts || []).slice(0, 8).forEach((p) => {
        const card = el("div", { className: "content-card" },
            el("p", { className: "post-meta", textContent: new Date(p.created_at).toLocaleDateString() }),
            el("h2", { textContent: p.title }),
            el("p", { className: "pre", textContent: p.body }));
        if (p.image_path) card.append(el("img", { src: pub(p.image_path), className: "chat-img", alt: p.title }));
        ub.append(card);
    });
    const pics = (posts || []).filter((p) => p.image_path).slice(0, 12);
    if (pics.length) {
        $("gallerySec").hidden = false;
        pics.forEach((p) => $("gallery").append(el("img", { src: pub(p.image_path), alt: p.title, loading: "lazy" })));
    }

    if (isAdmin) {
        $("editBox").hidden = false;
        $("postLink").hidden = false;
        $("postLink").href = "Community.html?id=" + cid;
        $("eTagline").value = c.tagline || "";
        $("eAbout").value = c.about || "";
        $("eWebsite").value = c.website || "";
        $("eContact").value = c.contact || "";

        $("pageForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const patch = { tagline: $("eTagline").value.trim(), about: $("eAbout").value.trim(), website: $("eWebsite").value.trim(), contact: $("eContact").value.trim() };
            const file = $("eCover").files[0];
            if (file) {
                if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return setMessage("pageMsg", "Use a JPG, PNG or WebP under 5 MB.", "error");
                const path = cid + "/cover-" + crypto.randomUUID() + "." + file.type.split("/")[1];
                const up = await db.storage.from("update-images").upload(path, file);
                if (up.error) return setMessage("pageMsg", up.error.message, "error");
                patch.cover_path = path;
            }
            const { error } = await db.from("communities").update(patch).eq("id", cid);
            if (error) return setMessage("pageMsg", error.message, "error");
            setMessage("pageMsg", "Saved. Reloading...", "success");
            setTimeout(() => location.reload(), 500);
        });

        $("milestoneForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const { error } = await db.from("team_highlights").insert({
                community_id: cid, title: $("mTitle").value.trim(), detail: $("mDetail").value.trim(), when_text: $("mWhen").value.trim()
            });
            setMessage("milestoneMsg", error ? error.message : "Added.", error ? "error" : "success");
            if (!error) { e.target.reset(); loadMilestones(); }
        });
    }
    loadMilestones();
})();
