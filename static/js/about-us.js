const base = "/api/media";

let type = ""; // m = movies, t = TV, a = anime
let category = "t"; // t = trending, p = popular, r = recent
let page = 1;
let totalPages = 1;
let searchQuery = "";

lucide.createIcons();
document.addEventListener("DOMContentLoaded", m);


// =========================
// Shared media loader
// =========================

async function loadMedia(media, category2, page2 = 1) {
    const categoryLookup = {
        t: "trending",
        p: "popular",
        r: "recent"
    };

    const categoryName = categoryLookup[category2];

    if (!categoryName) {
        console.error("Invalid category:", category2);
        return;
    }

    const url =
        `${base}/b/${media}/${categoryName}?page=${page2}`;

    try {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        renderResults(media, data);

        page = page2;
        totalPages = data.totalPages ?? 1;

        document.getElementById("page").innerText =
            ` Page ${page}/${totalPages}`;

        document.getElementById("prev").disabled =
            page <= 1;

        document.getElementById("next").disabled =
            page >= totalPages;

    } catch (error) {
        console.error("Failed to load media:", error);

        document.getElementById("entrybox").innerHTML =
            "<p>Failed to load media.</p>";
    }
}

function renderResults(media, data) {
    let html = "";

    data.results.forEach(item => {
        const id = item.id;
        const title = item.title ?? "Unknown";
        const poster = encodeURIComponent(item.poster ?? "");

        let rating;
        let year;
        let watchFunction;
        let episodes = "";

        if (media === "m") {
            rating = Math.round((item.rating ?? 0) * 10);
            year = item.releaseDate?.substring(0, 4);
            watchFunction = "wm";
        }

        else if (media === "t") {
            rating = Math.round((item.rating ?? 0) * 10);
            year = item.firstAirDate?.substring(0, 4);
            watchFunction = "wt";
        }

        else if (media === "a") {
            rating = item.rating ?? 0;
            year = item.startDate?.year;
            watchFunction = "wa";
            episodes = `, ${item.episodes ?? 0}, '${title.replaceAll("\"", "\\\"").replaceAll("'", "\\'")}'`;
        }

        html += `
            <div class="entry">
                <img
                    src="/api/image?url=${poster}"
                    alt="${title} poster"
                    loading="lazy"
                />

                <div class="below">
                    <div class="title">${title}</div>

                    <div class="meta">
                        <span>${year ?? "N/A"}</span>
                        |
                        <span>${rating ? rating + "%" : "No"} rating</span>
                    </div>

                    <button
                        class="watch"
                        onclick="${watchFunction}(${id}${episodes})"
                    >
                        Watch
                    </button>
                </div>
            </div>
        `;
    });

    document.getElementById("entrybox").innerHTML =
        html || "<p>No results found.</p>";
}


// =========================
// Movies
// =========================

function m() {
    if (type === "m") return;

    type = "m";
    searchQuery = "";

    document.getElementById("filters").innerHTML = `
        <button onclick="mt()">Trending</button>
        <button onclick="mp()">Popular</button>
        <button onclick="mr()">Recent</button>
    `;

    mt();
}

function mt() {
    if (type !== "m") return;

    category = "t";
    loadMedia("m", category, 1);
}

function mp() {
    if (type !== "m") return;

    category = "p";
    loadMedia("m", category, 1);
}

function mr() {
    if (type !== "m") return;

    category = "r";
    loadMedia("m", category, 1);
}


// =========================
// TV Shows
// =========================

function t() {
    if (type === "t") return;

    type = "t";
    searchQuery = "";
    document.getElementById("filters").innerHTML = `
        <button onclick="tt()">Trending</button>
        <button onclick="tp()">Popular</button>
        <button onclick="tr()">Recent</button>
    `;

    tt();
}

function tt() {
    if (type !== "t") return;

    category = "t";
    loadMedia("t", category, 1);
}

function tp() {
    if (type !== "t") return;

    category = "p";
    loadMedia("t", category, 1);
}

function tr() {
    if (type !== "t") return;

    category = "r";
    loadMedia("t", category, 1);
}


// =========================
// Anime
// =========================

function a() {
    if (type === "a") return;

    type = "a";
    searchQuery = "";
    document.getElementById("filters").innerHTML = `
        <button onclick="at()">Trending</button>
        <button onclick="ap()">Popular</button>
        <button onclick="ar()">Recent</button>
    `;

    at();
}

function at() {
    if (type !== "a") return;

    category = "t";
    loadMedia("a", category, 1);
}

function ap() {
    if (type !== "a") return;

    category = "p";
    loadMedia("a", category, 1);
}

function ar() {
    if (type !== "a") return;

    category = "r";
    loadMedia("a", category, 1);
}


// =========================
// Pagination
// =========================

function prev() {
    if (page <= 1) return;

    loadMedia(type, category, page - 1);
}

function next() {
    if (page >= totalPages) return;

    loadMedia(type, category, page + 1);
}

async function search(page2 = 1) {
    const input = document.getElementById("searchmedia");
    const query = input.value.trim();

    if (!query) return;
    if (!["m", "t", "a"].includes(type)) return;

    searchQuery = query;

    const url =
        `${base}/s/${type}?q=${encodeURIComponent(searchQuery)}&page=${page2}`;

    try {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        renderResults(type, data);

        page = page2;
        totalPages = data.totalPages ?? 1;

        document.getElementById("page").innerText =
            ` Page ${page}/${totalPages}`;

        document.getElementById("prev").disabled =
            page <= 1;

        document.getElementById("next").disabled =
            page >= totalPages;

    } catch (error) {
        console.error("Search failed:", error);

        document.getElementById("entrybox").innerHTML =
            "<p>Failed to search.</p>";
    }
}

async function wm(id) {
    try {
        const res = await fetch(`${base}/m/${id}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        document.getElementById("medianame").innerText = data.title ?? "Movie";
        document.getElementById("iframe2").src = data.player;

        // Hide TV/anime controls
        document.getElementById("seasepis").style.display = "none";

        document.getElementById("iframe").style.display = "flex";

        lucide.createIcons();

    } catch (error) {
        console.error("Failed to load movie:", error);
    }
}


async function wt(id) {
    try {
        const res = await fetch(`${base}/t/${id}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        document.getElementById("medianame").innerText =
            data.title ?? "TV Show";

        const season = document.getElementById("season");
        const episode = document.getElementById("episode");
        const subdub = document.getElementById("subdub");

        // Show controls
        document.getElementById("seasepis").style.display = "block";

        // Reset dropdowns
        season.innerHTML = `
            <option value="none">Choose a season</option>
        `;

        episode.innerHTML = `
            <option value="none">Choose an episode</option>
        `;

        // Sub/dub isn't needed for TV
        subdub.style.display = "none";

        // Add seasons
        data.seasons.forEach(item => {
            season.innerHTML += `
                <option value="${item.season}">
                    ${item.name}
                </option>
            `;
        });

        // Clear player
        document.getElementById("iframe2").src = "";

        document.getElementById("iframe").style.display = "flex";

        // When season changes, load its episodes
        season.onchange = async function () {
            const seasonNumber = this.value;

            episode.innerHTML = `
                <option value="none">Choose an episode</option>
            `;

            document.getElementById("iframe2").src = "";

            if (seasonNumber === "none") return;

            try {
                const res = await fetch(
                    `${base}/t/${id}/${seasonNumber}`
                );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const seasonData = await res.json();

                seasonData.episodes.forEach(item => {
                    episode.innerHTML += `
                        <option value="${item.episode}">
                            ${item.episode}. ${item.title}
                        </option>
                    `;
                });

            } catch (error) {
                console.error("Failed to load episodes:", error);
            }
        };

        // When episode changes, load Vidnest
        episode.onchange = async function () {
            const seasonNumber = season.value;
            const episodeNumber = this.value;

            if (
                seasonNumber === "none" ||
                episodeNumber === "none"
            ) {
                document.getElementById("iframe2").src = "";
                return;
            }

            try {
                const res = await fetch(
                    `${base}/t/${id}/${seasonNumber}/${episodeNumber}`
                );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const episodeData = await res.json();

                document.getElementById("iframe2").src =
                    episodeData.player;

            } catch (error) {
                console.error("Failed to load episode:", error);
            }
        };

        lucide.createIcons();

    } catch (error) {
        console.error("Failed to load TV show:", error);
    }
}
async function loadAnimeEpisode(id) {
    const episode = document.getElementById("episode").value;
    const subdub = document.getElementById("subdub").value;

    try {
        const res = await fetch(
            `${base}/a/${id}/${episode}/${subdub}`
        );

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        document.getElementById("iframe2").src = data.player;

    } catch (error) {
        console.error("Failed to load anime episode:", error);
    }
}
async function wa(id, episodes, title) {
    try {
        document.getElementById("medianame").innerText = title;

        document.getElementById("iframe").style.display = "flex";
        document.getElementById("seasepis").style.display = "block";

        document.getElementById("season").style.display = "none";
        document.getElementById("episode").style.display = "inline-block";
        document.getElementById("subdub").style.display = "inline-block";

        const episodeSelect = document.getElementById("episode");

        episodeSelect.innerHTML = "";

        for (let i = 1; i <= episodes; i++) {
            episodeSelect.innerHTML +=
                `<option value="${i}">Episode ${i}</option>`;
        }

        episodeSelect.onchange = () => loadAnimeEpisode(id);
        document.getElementById("subdub").onchange =
            () => loadAnimeEpisode(id);

        await loadAnimeEpisode(id);

    } catch (error) {
        console.error("Failed to load anime:", error);
    }
}

function closee() {
    document.getElementById("iframe").style.display = "none";
    document.getElementById("iframe2").src = "";
}