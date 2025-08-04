export async function getCollectionProducts({ collection }: { collection: string }) {
  const res = await fetch(`/api/collections/${collection}`);
  return res.json();
}