document.getElementById("btnLogin").addEventListener("click", async () => {
    const emailValue = document.getElementById("email").value;
    const passwordValue = document.getElementById("password").value;

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue
    });

    if (error) {
        document.getElementById("message").innerText = error.message;
        return;
    }

    window.location.href = "dashboard.html";
});