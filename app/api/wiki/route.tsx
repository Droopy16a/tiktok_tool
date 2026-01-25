export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "Bubble_sort";
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext&titles=${title}&format=json&origin=*`
  );

  const data = await res.json();

  const pages = data.query.pages;
  const page = pages[Object.keys(pages)[0]];

  return Response.json({ text: page.extract });
}
