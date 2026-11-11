
document.addEventListener("DOMContentLoaded", () => {
    const nx = new URLSearchParams(location.search).get("next");
    if (nx) document.querySelectorAll('a[href="Register.html"], a[href="Login.html"]').forEach((a) => { if (!a.id) a.href += "?next=" + encodeURIComponent(nx); });
    const reg = $("registerForm"), login = $("loginForm"), prof = $("profileForm");

    if (reg) reg.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = $("name").value.trim(), email = $("email").value.trim();
        const password = $("password").value;
        if (password.length < 8) return setMessage("registerMessage", "Use at least 8 characters.", "error");
        if (password !== $("confirmPassword").value) return setMessage("registerMessage", "Passwords don't match.", "error");
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { name } } });
        if (error) return setMessage("registerMessage", error.message, "error");
        if (!data.session) return setMessage("registerMessage", "Check your email to confirm your account, then log in.", "success");
        window.location.href = safeNext() || "Communities.html";
    });

    if (login) login.addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
        if (error) return setMessage("loginMessage", "Email or password is incorrect.", "error");
        window.location.href = safeNext() || "Communities.html";
    });

    if (prof) (async () => {
        const user = await requireUser();
        if (!user) return;
        $("profileEmail").textContent = user.email;
        const { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
        $("profileName").textContent = data ? data.name : "Member";
        if (data && data.avatar_url) { $("avatarImg").src = avatarUrl(data.avatar_url); $("avatarImg").hidden = false; }
        $("avatarFile").addEventListener("change", async () => {
            const f = $("avatarFile").files[0];
            if (!f) return;
            if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 2 * 1024 * 1024) return setMessage("avatarMsg", "Use a JPG, PNG or WebP under 2 MB.", "error");
            const path = user.id + "/" + Date.now() + "." + f.type.split("/")[1];
            const up = await db.storage.from("avatars").upload(path, f);
            if (up.error) return setMessage("avatarMsg", up.error.message, "error");
            const { error } = await db.from("profiles").update({ avatar_url: path }).eq("id", user.id);
            if (error) return setMessage("avatarMsg", error.message, "error");
            $("avatarImg").src = avatarUrl(path);
            $("avatarImg").hidden = false;
            setMessage("avatarMsg", "Photo updated.", "success");
        });
        $("history").value = data ? data.rocketry_history || "" : "";
        $("portfolio").value = data ? data.portfolio || "" : "";
        $("allowDms").checked = data ? data.allow_outside_dms !== false : true;
        prof.addEventListener("submit", async (e) => {
            e.preventDefault();
            const { error } = await db.from("profiles").update({
                rocketry_history: $("history").value.trim(), portfolio: $("portfolio").value.trim(), allow_outside_dms: $("allowDms").checked
            }).eq("id", user.id);
            setMessage("profileMessage", error ? error.message : "Profile saved.", error ? "error" : "success");
        });
        $("logoutButton").addEventListener("click", async () => {
            await db.auth.signOut();
            window.location.href = "Login.html";
        });
    })();
});
