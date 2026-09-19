const express = require("express");

const TMDB_API_KEY = "2713804610e1e236b1cf44bfac3a7776";

function media() {
    const router = express.Router();

    // Movie
    router.get("/m/:tmdbId", async (req, res) => {
        try {
            const {
                tmdbId
            } = req.params;

            const response = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "Movie not found"
                });
            }

            const movie = await response.json();

            res.json({
                type: "movie",
                id: movie.id,
                title: movie.title,
                description: movie.overview,
                releaseDate: movie.release_date,
                poster: movie.poster_path ?
                    `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                backdrop: movie.backdrop_path ?
                    `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
                player: `https://vidnest.fun/movie/${movie.id}?servericon=hide`
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    router.get("/t/:tmdbId/:season", async (req, res) => {
        try {
            const {
                tmdbId,
                season
            } = req.params;

            const seasonNumber = Number(season);

            if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
                return res.status(400).json({
                    error: "Invalid season"
                });
            }

            const response = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "TMDB request failed"
                });
            }

            const data = await response.json();

            res.json({
                type: "tv",
                id: Number(tmdbId),
                season: seasonNumber,

                episodes: (data.episodes || []).map(episode => ({
                    episode: episode.episode_number,
                    title: episode.name,
                    description: episode.overview,
                    airDate: episode.air_date,
                    still: episode.still_path ?
                        `https://image.tmdb.org/t/p/w780${episode.still_path}` :
                        null
                }))
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    // TV episode
    router.get("/t/:tmdbId/:season/:episode", async (req, res) => {
        try {
            const {
                tmdbId,
                season,
                episode
            } = req.params;

            const response = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "TV show not found"
                });
            }

            const show = await response.json();

            res.json({
                type: "tv",
                id: show.id,
                title: show.name,
                description: show.overview,
                poster: show.poster_path ?
                    `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                backdrop: show.backdrop_path ?
                    `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
                season: Number(season),
                episode: Number(episode),
                player: `https://vidnest.fun/tv/${show.id}/${season}/${episode}?servericon=hide`
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });

    // Anime
    router.get("/a/:anilistId/:episode/:subdub", async (req, res) => {
        try {
            const {
                anilistId,
                episode,
                subdub
            } = req.params;

            if (!["sub", "dub"].includes(subdub.toLowerCase())) {
                return res.status(400).json({
                    error: "subdub must be 'sub' or 'dub'"
                });
            }

            const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              large
            }
            bannerImage
          }
        }
      `;

            const response = await fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query,
                    variables: {
                        id: Number(anilistId)
                    }
                })
            });

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "AniList request failed"
                });
            }

            const data = await response.json();
            const anime = data.data?.Media;

            if (!anime) {
                return res.status(404).json({
                    error: "Anime not found"
                });
            }

            res.json({
                type: "anime",
                id: anime.id,
                title: anime.title.english ||
                    anime.title.romaji ||
                    anime.title.native,
                description: anime.description,
                poster: anime.coverImage?.large ?? null,
                backdrop: anime.bannerImage ?? null,
                episode: Number(episode),
                subdub: subdub.toLowerCase(),
                player: `https://vidnest.fun/anime/${anime.id}/${episode}/${subdub.toLowerCase()}?servericon=hide`
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    // Search movies
    router.get("/s/m", async (req, res) => {
        try {
            const q = req.query.q;
            const page = Math.max(1, Number(req.query.page) || 1);

            if (!q) {
                return res.status(400).json({
                    error: "Missing query"
                });
            }

            const response = await fetch(
                `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "TMDB request failed"
                });
            }

            const data = await response.json();

            res.json({
                type: "movie",
                page: data.page,
                totalPages: data.total_pages,
                totalResults: data.total_results,
                results: data.results.slice(0, 20).map(movie => ({
                    id: movie.id,
                    title: movie.title,
                    description: movie.overview,
                    releaseDate: movie.release_date,
                    rating: movie.vote_average,
                    poster: movie.poster_path ?
                        `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                    backdrop: movie.backdrop_path ?
                        `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null
                }))
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });


    // Search TV shows
    router.get("/s/t", async (req, res) => {
        try {
            const q = req.query.q;
            const page = Math.max(1, Number(req.query.page) || 1);

            if (!q) {
                return res.status(400).json({
                    error: "Missing query"
                });
            }

            const response = await fetch(
                `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "TMDB request failed"
                });
            }

            const data = await response.json();

            res.json({
                type: "tv",
                page: data.page,
                totalPages: data.total_pages,
                totalResults: data.total_results,
                results: data.results.slice(0, 20).map(show => ({
                    id: show.id,
                    title: show.name,
                    description: show.overview,
                    firstAirDate: show.first_air_date,
                    rating: show.vote_average,
                    poster: show.poster_path ?
                        `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                    backdrop: show.backdrop_path ?
                        `https://image.tmdb.org/t/p/w780${show.backdrop_path}` : null
                }))
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });


    // Search anime
    router.get("/s/a", async (req, res) => {
        try {
            const q = req.query.q;
            const page = Math.max(1, Number(req.query.page) || 1);

            if (!q) {
                return res.status(400).json({
                    error: "Missing query"
                });
            }

            const query = `
        query ($search: String, $page: Int) {
            Page(page: $page, perPage: 20) {
            pageInfo {
                currentPage
                lastPage
                total
            }

            media(search: $search, type: ANIME) {
                id
                title {
                romaji
                english
                native
                }
                description
                episodes
                status
                coverImage {
                large
                }
                bannerImage
                startDate {
                year
                month
                day
                }
            }
            }
        }
        `;

            const response = await fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query,
                    variables: {
                        search: q,
                        page
                    }
                })
            });

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "AniList request failed"
                });
            }

            const data = await response.json();

            if (data.errors) {
                return res.status(500).json({
                    error: "AniList query failed",
                    details: data.errors
                });
            }

            const pageData = data.data?.Page;

            res.json({
                type: "anime",
                page: pageData?.pageInfo?.currentPage ?? page,
                totalPages: pageData?.pageInfo?.lastPage ?? 0,
                totalResults: pageData?.pageInfo?.total ?? 0,
                results: (pageData?.media ?? []).slice(0, 20).map(anime => ({
                    id: anime.id,
                    title: anime.title.english ||
                        anime.title.romaji ||
                        anime.title.native,
                    description: anime.description,
                    episodes: anime.episodes,
                    status: anime.status,
                    poster: anime.coverImage?.large ?? null,
                    backdrop: anime.bannerImage ?? null,
                    startDate: anime.startDate
                }))
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    router.get("/t/:tmdbId", async (req, res) => {
        try {
            const {
                tmdbId
            } = req.params;

            const response = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
            );

            if (!response.ok) {
                return res.status(response.status).json({
                    error: "TMDB request failed"
                });
            }

            const show = await response.json();

            res.json({
                type: "tv",
                id: show.id,
                title: show.name,
                description: show.overview,
                releaseDate: show.first_air_date,

                poster: show.poster_path ?
                    `https://image.tmdb.org/t/p/w500${show.poster_path}` :
                    null,

                backdrop: show.backdrop_path ?
                    `https://image.tmdb.org/t/p/original${show.backdrop_path}` :
                    null,

                numberOfSeasons: show.number_of_seasons,

                seasons: (show.seasons || [])
                    .filter(season => season.season_number > 0)
                    .map(season => ({
                        season: season.season_number,
                        name: season.name,
                        episodeCount: season.episode_count,
                        airDate: season.air_date,
                        poster: season.poster_path ?
                            `https://image.tmdb.org/t/p/w500${season.poster_path}` :
                            null
                    }))
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    // ─────────────────────────────
    // BROWSE / DISCOVERY
    // ─────────────────────────────

    router.get("/b/:type/:category", async (req, res) => {
        try {
            const {
                type,
                category
            } = req.params;
            const page = Math.max(1, Number(req.query.page) || 1);

            if (!["m", "t", "a"].includes(type)) {
                return res.status(400).json({
                    error: "Invalid media type"
                });
            }

            if (!["popular", "trending", "recent"].includes(category)) {
                return res.status(400).json({
                    error: "Invalid category"
                });
            }

            // ─────────────────────────
            // MOVIES
            // ─────────────────────────

            if (type === "m") {
                let endpoint;

                if (category === "popular") {
                    endpoint = `/movie/popular?page=${page}`;
                }

                if (category === "trending") {
                    endpoint = `/trending/movie/week?page=${page}`;
                }

                if (category === "recent") {
                    endpoint =
                        `/discover/movie?page=${page}` +
                        `&sort_by=primary_release_date.desc` +
                        `&primary_release_date.lte=${new Date().toISOString().slice(0, 10)}` +
                        `&vote_count.gte=5`;
                }

                const response = await fetch(
                    `https://api.themoviedb.org/3${endpoint}&api_key=${TMDB_API_KEY}`
                );

                if (!response.ok) {
                    return res.status(response.status).json({
                        error: "TMDB request failed"
                    });
                }

                const data = await response.json();

                return res.json({
                    type: "movie",
                    category,
                    page: data.page,
                    totalPages: data.total_pages,
                    totalResults: data.total_results,

                    results: (data.results || []).map(movie => ({
                        id: movie.id,
                        title: movie.title,
                        description: movie.overview,
                        releaseDate: movie.release_date,

                        poster: movie.poster_path ?
                            `https://image.tmdb.org/t/p/w500${movie.poster_path}` :
                            null,

                        backdrop: movie.backdrop_path ?
                            `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` :
                            null,

                        rating: movie.vote_average
                    }))
                });
            }

            // ─────────────────────────
            // TV
            // ─────────────────────────

            if (type === "t") {
                let endpoint;

                if (category === "popular") {
                    endpoint = `/tv/popular?page=${page}`;
                }

                if (category === "trending") {
                    endpoint = `/trending/tv/week?page=${page}`;
                }

                if (category === "recent") {
                    endpoint =
                        `/discover/tv?page=${page}` +
                        `&sort_by=first_air_date.desc` +
                        `&first_air_date.lte=${new Date().toISOString().slice(0, 10)}` +
                        `&vote_count.gte=5`;
                }

                const response = await fetch(
                    `https://api.themoviedb.org/3${endpoint}&api_key=${TMDB_API_KEY}`
                );

                if (!response.ok) {
                    return res.status(response.status).json({
                        error: "TMDB request failed"
                    });
                }

                const data = await response.json();

                return res.json({
                    type: "tv",
                    category,
                    page: data.page,
                    totalPages: data.total_pages,
                    totalResults: data.total_results,

                    results: (data.results || []).map(show => ({
                        id: show.id,
                        title: show.name,
                        description: show.overview,
                        firstAirDate: show.first_air_date,

                        poster: show.poster_path ?
                            `https://image.tmdb.org/t/p/w500${show.poster_path}` :
                            null,

                        backdrop: show.backdrop_path ?
                            `https://image.tmdb.org/t/p/w780${show.backdrop_path}` :
                            null,

                        rating: show.vote_average
                    }))
                });
            }

            // ─────────────────────────
            // ANIME
            // ─────────────────────────

            if (type === "a") {

                let sort;

                if (category === "popular" || category === "trending") {
                    sort = "POPULARITY_DESC";
                }

                if (category === "recent") {
                    sort = "START_DATE_DESC";
                }

                const query = `
        query ($page: Int, $sort: [MediaSort]) {
          Page(
            page: $page
            perPage: 20
          ) {
            pageInfo {
              currentPage
              lastPage
              total
            }

            media(
              type: ANIME
              sort: $sort
            ) {
              id

              title {
                romaji
                english
                native
              }

              description
              episodes
              status

              averageScore

              coverImage {
                large
              }

              bannerImage

              startDate {
                year
                month
                day
              }
            }
          }
        }
      `;

                const response = await fetch(
                    "https://graphql.anilist.co", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            query,
                            variables: {
                                page,
                                sort: [sort]
                            }
                        })
                    }
                );

                if (!response.ok) {
                    return res.status(response.status).json({
                        error: "AniList request failed"
                    });
                }

                const data = await response.json();

                if (data.errors) {
                    return res.status(500).json({
                        error: "AniList query failed",
                        details: data.errors
                    });
                }

                const pageData = data.data?.Page;

                return res.json({
                    type: "anime",
                    category,

                    page: pageData?.pageInfo?.currentPage ??
                        page,

                    totalPages: pageData?.pageInfo?.lastPage ??
                        0,

                    totalResults: pageData?.pageInfo?.total ??
                        0,

                    results: (pageData?.media || []).map(anime => ({
                        id: anime.id,

                        title: anime.title.english ||
                            anime.title.romaji ||
                            anime.title.native,

                        description: anime.description,

                        episodes: anime.episodes,

                        status: anime.status,

                        rating: anime.averageScore,

                        poster: anime.coverImage?.large ??
                            null,

                        backdrop: anime.bannerImage ??
                            null,

                        startDate: anime.startDate
                    }))
                });
            }

        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: "Internal server error"
            });
        }
    });
    return router;
}

module.exports = media;