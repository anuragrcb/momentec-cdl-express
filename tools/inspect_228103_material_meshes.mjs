import fs from "node:fs";

const sku = process.argv[2] || "228103";
const glbPath = new URL(`../assets/augusta-live/hockey-3d/${sku}/${sku}.glb`, import.meta.url);
const data = fs.readFileSync(glbPath);
let offset = 12;
let json;
while (offset < data.length) {
  const length = data.readUInt32LE(offset);
  const type = data.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) json = JSON.parse(data.subarray(offset + 8, offset + 8 + length).toString("utf8").trim());
  offset += 8 + length;
}
if (!json) throw new Error("GLB JSON chunk unavailable");
const materials = (json.materials || []).map((material, index) => material.name || `material-${index}`);
const binaryOffset = (() => {
  let cursor = 12;
  while (cursor < data.length) {
    const length = data.readUInt32LE(cursor);
    const type = data.readUInt32LE(cursor + 4);
    if (type === 0x004e4942) return cursor + 8;
    cursor += 8 + length;
  }
  return null;
})();
function uvBounds(accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  const view = json.bufferViews?.[accessor?.bufferView];
  if (!accessor || !view || accessor.componentType !== 5126 || accessor.type !== "VEC2" || binaryOffset === null) return null;
  const values = [];
  const stride = view.byteStride || 8;
  const start = binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  for (let index = 0; index < accessor.count; index += 1) {
    values.push([data.readFloatLE(start + index * stride), data.readFloatLE(start + index * stride + 4)]);
  }
  return [
    [Math.min(...values.map(([u]) => u)), Math.min(...values.map(([, v]) => v))],
    [Math.max(...values.map(([u]) => u)), Math.max(...values.map(([, v]) => v))],
  ];
}
const rows = [];
for (const [meshIndex, mesh] of (json.meshes || []).entries()) {
  for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
    rows.push({
      meshIndex,
      mesh: mesh.name || `mesh-${meshIndex}`,
      primitiveIndex,
      materialIndex: primitive.material ?? null,
      material: primitive.material === undefined ? null : materials[primitive.material],
      positions: json.accessors?.[primitive.attributes?.POSITION]?.count ?? null,
      texcoords: json.accessors?.[primitive.attributes?.TEXCOORD_0]?.count ?? null,
      uvBounds: uvBounds(primitive.attributes?.TEXCOORD_0),
    });
  }
}
console.log(JSON.stringify({ sku, materials, primitives: rows }, null, 2));
