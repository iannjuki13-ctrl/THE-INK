const container = document.getElementById("news-container");
const buttons = document.querySelectorAll("#categories button");

async function fetchNews() {
  try {
    const res = await fetch("/api/fetchSummaries");
    const data = await res.json();
    displayNews(data);
  } catch {
    container.innerHTML = `<p class="error">Error loading news. Try again later.</p>`;
  }
}

function displayNews(articles) {
  container.innerHTML = articles
    .slice(0, 50)
    .map(
      (a) => `
      <article class="card">
        <h2>${a.title}</h2>
        <p><strong>${a.category}</strong> | ${new Date(a.pubDate).toLocaleString()}</p>
        <a href="${a.link}" target="_blank">Read more →</a>
      </article>
    `
    )
    .join("");
}

buttons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    buttons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const res = await fetch("/api/fetchSummaries");
    const allArticles = await res.json();

    const category = btn.dataset.category;
    const filtered =
      category === "all"
        ? allArticles
        : allArticles.filter((a) =>
            a.category.toLowerCase().includes(category)
          );

    displayNews(filtered);
  });
});

// Auto-refresh every 5 seconds
setInterval(fetchNews, 5000);
fetchNews();
