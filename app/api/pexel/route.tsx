import { NextResponse } from 'next/server';
import { createClient } from 'pexels';

export async function POST(req: Request) {
  const { keyword, imageIndex } = await req.json();
  if (!keyword) {
    return NextResponse.json({ ok: false });
  }

  var photo_url = '';

  const client = createClient('jfMnK2BoZZ9FJIhSfnU3eV4GTIAqoSnwCPIf4uWQwvmEILYW930NZRUR');

  await client.photos.search({ query: keyword, per_page: 15 })
  .then((res : any) => {
    if (res && res.photos.length > 0){
      const index = imageIndex || 0;
      const photoIndex = index % res.photos.length;
      photo_url = res.photos[photoIndex].src.original;
    }
  })
  .catch((err) => {
    console.error(err);
  })
  ;

  return NextResponse.json({ ok: true, url: photo_url });
}
