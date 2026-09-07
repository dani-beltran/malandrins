/** URLs are relative to public/. See ASSETS.md for formats and sizing. */
export const assetConfig: {
  models: { player?: string; car?: string; npc?: string };
  textures: { facade?: string; roof?: string; asphalt?: string };
  portraits: Record<string, string>;
  music?: string;
} = { models: {}, textures: {}, portraits: {} };
