export const fetchArtInfo = async (title) => {
  try {
    const res = await fetch("http://localhost:3000/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    return data.text;
  } catch (err) {
    console.error("Error fetching Gemini info:", err);
    return "No information found.";
  }
};
