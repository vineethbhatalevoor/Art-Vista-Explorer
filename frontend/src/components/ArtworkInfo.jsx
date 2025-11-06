import React from "react";

export default function ArtworkInfo({ title, description, audioUrl }) {
  return (
    <div className="p-4 text-center bg-white bg-opacity-80 backdrop-blur-md rounded-xl shadow-lg max-w-md mx-auto mt-4">
      <h2 className="text-2xl font-semibold mb-2">{title || "No Title"}</h2>
      <p className="text-gray-700 mb-4">{description || "No Description"}</p>

      {audioUrl ? (
        <audio controls className="mx-auto">
          <source src={audioUrl} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="text-sm text-gray-500">No audio available.</p>
      )}
    </div>
  );
}
