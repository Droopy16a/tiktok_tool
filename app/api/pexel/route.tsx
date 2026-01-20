import { NextResponse } from 'next/server';
import { createClient } from 'pexels';

export async function POST(req: Request) {
  const { keyword } = await req.json();
  var photo_url = '';

  const client = createClient('866URLSijsafUGBAutW0LNy9Z8BemDZKkZuvJDyNfHynszftzggQyngT');

  await client.photos.search({ query: keyword, per_page: 1 })
  .then((res : any) => {
    if (res){
      photo_url = res.photos[0].src;
    }
  })
  .catch((err) => {
    console.error(err);
  })
  ;

  return NextResponse.json({ ok: true, url: photo_url });
}
