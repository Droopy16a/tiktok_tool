export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let title = searchParams.get("title") || "Bubble_sort";

  // Normalize title: replace spaces with underscores and capitalize each word
  title = title.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('_');

  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext&exintro&titles=${title}&format=json&origin=*`
  );

  const data = await res.json();

  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  const page = pages[pageId];

  if (page.missing) {
    return Response.json({ error: "Page not found", title });
  }

  return Response.json({ text: page.extract || "No extract available" });
}
