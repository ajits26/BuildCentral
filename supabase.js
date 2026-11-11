const SUPABASE_URL = "https://vsgzubleytoofewrgyuq.supabase.co";
const SUPABASE_KEY = "sb_publishable_ptcrOmpi0bpSP4wQh8H_Fg_dzf-vqHL";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

function setMessage(id, text, type = "info") {
    const m = $(id);
    if (!m) return;
    m.textContent = text;
    m.style.color = type === "error" ? "#ff8a8a" : type === "success" ? "#7be0a0" : "#c6d4e3";
}

function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    e.append(...kids);
    return e;
}

async function getUser() {
    const { data } = await db.auth.getSession();
    return data.session ? data.session.user : null;
}

async function requireUser() {
    const u = await getUser();
    if (!u) goLogin();
    return u;
}

document.addEventListener("DOMContentLoaded", async () => {
    const link = $("authLink");
    if (link && (await getUser())) {
        link.textContent = "Profile";
        link.href = "Profile.html";
    }
});

function avatarUrl(path) {
    return db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

function avatar(path) {
    return path ? el("img", { src: avatarUrl(path), className: "avatar", alt: "" }) : "";
}

function goLogin() {
    const here = location.pathname.split("/").pop() + location.search;
    window.location.href = "Login.html?next=" + encodeURIComponent(here);
}

function safeNext() {
    const n = new URLSearchParams(location.search).get("next") || "";
    return /^[A-Za-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/.test(n) ? n : null;
}

function loginPrompt(after) {
    return el("p", { className: "page-intro" },
        el("a", { href: "#", textContent: "Log in or sign up", onclick: (e) => { e.preventDefault(); goLogin(); } }), " " + after);
}
