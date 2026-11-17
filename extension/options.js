const input = document.getElementById("token");
browser.storage.local.get("token").then(({ token }) => { if (token) input.value = token; });
document.getElementById("save").addEventListener("click", async () => {
  await browser.storage.local.set({ token: input.value.trim() });
  document.getElementById("msg").textContent = "Enregistré ✓";
});
