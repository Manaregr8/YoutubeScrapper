const fs = require("fs");
const { exec } = require("child_process");
const dotenv = require("dotenv");
const { parse } = require("json2csv");
const { getTranscript } = require("youtube-transcript-api");

dotenv.config();

const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const API_KEY = process.env.API_KEY;
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

const fetchSearchResults = async (query, maxResults = 50, pageToken = "") => {
  const url = `${SEARCH_URL}?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
    query
  )}&pageToken=${pageToken}&key=${API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch search results: ${response.statusText}`);
  return await response.json();
};

const fetchVideoDetails = async (videoIds) => {
  const url = `${VIDEOS_URL}?part=snippet,contentDetails,statistics,topicDetails,status,recordingDetails&id=${videoIds.join(
    ","
  )}&key=${API_KEY}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video details for ${videoIds}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching video details: ${error.message}`);
    return null;
  }
};

const fetchCaptionText = async (videoId) => {
  try {
    const transcript = await getTranscript(videoId);
    return transcript.map(item => item.text).join("\n");
  } catch (error) {
    console.log(`No transcript available for video: ${videoId}`);
    return null;
  }
};

const main = async () => {
  console.log("Starting script...");
  let allVideos = [];
  let pageToken = "";
  const query = "games";
  const maxResults = 50;

  // Fetch video IDs in batches of 50
  while (allVideos.length < 500) {
    console.log(`Fetching search results... Current total: ${allVideos.length}`);
    const searchResults = await fetchSearchResults(query, maxResults, pageToken);
    allVideos = allVideos.concat(searchResults.items);
    pageToken = searchResults.nextPageToken || "";
    if (!pageToken) break;
  }

  console.log(`Fetched ${allVideos.length} video IDs.`);
  const videoIds = allVideos.map((item) => item.id.videoId);

  const details = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunkIds = videoIds.slice(i, i + 50);
    console.log(`Fetching details for videos ${i + 1}-${i + chunkIds.length}...`);
    const videoDetails = await fetchVideoDetails(chunkIds);
    if (videoDetails) {
      details.push(...videoDetails.items);
    } else {
      console.log(`Skipping chunk of videos ${i + 1}-${i + chunkIds.length} due to error.`);
    }
  }

  console.log("Processing video data...");
  const data = [];
  for (const video of details) {
    const snippet = video.snippet || {};
    const contentDetails = video.contentDetails || {};
    const statistics = video.statistics || {};
    const topicDetails = video.topicDetails || {};
    const recordingDetails = video.recordingDetails || {};

    const captionsAvailable = contentDetails.caption === "true";
    const captionText = captionsAvailable ? await fetchCaptionText(video.id) : null;

    data.push({
      videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
      title: snippet.title || "",
      description: snippet.description || "",
      channelTitle: snippet.channelTitle || "",
      keywordTags: snippet.tags ? snippet.tags.join(", ") : "",
      youtubeVideoCategory: snippet.categoryId || "",
      topicDetails: topicDetails.topicCategories ? topicDetails.topicCategories.join(", ") : "",
      videoPublishedAt: snippet.publishedAt || "",
      videoDuration: contentDetails.duration || "",
      viewCount: statistics.viewCount || "0",
      commentCount: statistics.commentCount || "0",
      captionsAvailable,
      captionText,
      locationOfRecording: recordingDetails.location
        ? `${recordingDetails.location.latitude}, ${recordingDetails.location.longitude}`
        : "",
    });
  }

  console.log("Sorting data by view count...");
  const sortedData = data.sort((a, b) => parseInt(b.viewCount) - parseInt(a.viewCount));

  console.log("Saving data to CSV...");
  const csvFields = [
    "videoUrl",
    "title",
    "description",
    "channelTitle",
    "keywordTags",
    "youtubeVideoCategory",
    "topicDetails",
    "videoPublishedAt",
    "videoDuration",
    "viewCount",
    "commentCount",
    "captionsAvailable",
    "captionText",
    "locationOfRecording",
  ];
  const csv = parse(sortedData, { fields: csvFields });
  fs.writeFileSync("sorted_youtube_data.csv", csv);

  console.log("Data saved to sorted_youtube_data.csv.");
};

main().catch((error) => {
  console.error("Error:", error.message);
});
