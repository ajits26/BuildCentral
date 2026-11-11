document.addEventListener("DOMContentLoaded", () => {
    const forgot = $("forgotForm"), reset = $("resetForm");

    if (forgot) forgot.addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await db.auth.resetPasswordForEmail($("email").value.trim(), { redirectTo: location.origin + "/ResetPassword.html" });
        setMessage("forgotMessage", error ? error.message : "If that email has an account, a reset link is on its way.", error ? "error" : "success");
    });

    if (reset) reset.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pw = $("password").value;
        if (pw.length < 8) return setMessage("resetMessage", "Use at least 8 characters.", "error");
        if (pw !== $("confirmPassword").value) return setMessage("resetMessage", "Passwords don't match.", "error");
        const { error } = await db.auth.updateUser({ password: pw });
        if (error) return setMessage("resetMessage", "Open this page from the link in your reset email. " + error.message, "error");
        setMessage("resetMessage", "Password updated. Redirecting...", "success");
        setTimeout(() => (window.location.href = "Communities.html"), 800);
    });
});
