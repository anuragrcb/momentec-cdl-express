import fs from "node:fs";
import path from "node:path";

const sku = process.argv[2] || "228108";
const glbPath = path.join(process.cwd(), "assets", "augusta-live", "hockey-3d", sku, `${sku}.glb`);
const data = fs.readFileSync(glbPath);

if (data.toString("utf8", 0, 4) !== "glTF") throw new Error(`${glbPath} is not a binary GLB.`);

let offset = 12;
let json;
let binary;
while (offset < data.length) {
  const length = data.readUInt32LE(offset);
  const type = data.readUInt32LE(offset + 4);
  const chunk = data.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").trim());
  if (type === 0x004e4942) binary = chunk;
  offset += 8 + length;
}
if (!json || !binary) throw new Error("GLB JSON or binary chunk was not found.");

const componentByteSize = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const accessorSummary = (index) => {
  const accessor = json.accessors?.[index];
  if (!accessor) return null;
  return { index, type: accessor.type, count: accessor.count, min: accessor.min, max: accessor.max };
};

function readAccessor(index) {
  const accessor = json.accessors[index];
  const bufferView = json.bufferViews[accessor.bufferView];
  const bytes = componentByteSize[accessor.componentType];
  const count = componentCount[accessor.type];
  const stride = bufferView.byteStride || bytes * count;
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const dv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const read = accessor.componentType === 5126
    ? (byte) => dv.getFloat32(byte, true)
    : accessor.componentType === 5125
      ? (byte) => dv.getUint32(byte, true)
      : accessor.componentType === 5123
        ? (byte) => dv.getUint16(byte, true)
        : (byte) => dv.getUint8(byte);
  return Array.from({ length: accessor.count }, (_, row) =>
    Array.from({ length: count }, (_, column) => read(base + row * stride + column * bytes)),
  );
}

function uvIslands(primitive) {
  if (primitive.indices === undefined || primitive.attributes?.TEXCOORD_0 === undefined) return [];
  const positions = readAccessor(primitive.attributes.POSITION);
  const uvs = readAccessor(primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(primitive.indices).map(([value]) => value);
  const parent = Array.from({ length: positions.length }, (_, index) => index);
  const find = (value) => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const join = (first, second) => {
    const a = find(first);
    const b = find(second);
    if (a !== b) parent[b] = a;
  };
  for (let index = 0; index < indices.length; index += 3) {
    join(indices[index], indices[index + 1]);
    join(indices[index + 1], indices[index + 2]);
  }
  const groups = new Map();
  positions.forEach((position, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push({ position, uv: uvs[index] });
    groups.set(root, group);
  });
  const bounds = (vertices, key) => [
    [Math.min(...vertices.map((vertex) => vertex[key][0])), Math.min(...vertices.map((vertex) => vertex[key][1]))],
    [Math.max(...vertices.map((vertex) => vertex[key][0])), Math.max(...vertices.map((vertex) => vertex[key][1]))],
  ];
  const mean = (vertices, dimension) => vertices.reduce((sum, vertex) => sum + vertex.position[dimension], 0) / vertices.length;
  return [...groups.values()]
    .filter((vertices) => vertices.length > 30)
    .map((vertices) => ({
      vertices: vertices.length,
      uvBounds: bounds(vertices, "uv"),
      centroid3d: [mean(vertices, 0), mean(vertices, 1), mean(vertices, 2)].map((value) => Number(value.toFixed(5))),
    }))
    .sort((first, second) => second.vertices - first.vertices);
}

const report = {
  sku,
  asset: json.asset,
  materials: (json.materials || []).map((material, index) => ({
    index,
    name: material.name || `material-${index}`,
    baseColorTexture: material.pbrMetallicRoughness?.baseColorTexture?.index ?? null,
    normalTexture: material.normalTexture?.index ?? null,
  })),
  meshes: (json.meshes || []).map((mesh, meshIndex) => ({
    meshIndex,
    name: mesh.name || `mesh-${meshIndex}`,
    primitives: (mesh.primitives || []).map((primitive, primitiveIndex) => ({
      primitiveIndex,
      material: primitive.material ?? null,
      uvIslands: uvIslands(primitive),
      attributes: Object.fromEntries(
        Object.entries(primitive.attributes || {}).map(([name, accessorIndex]) => [name, accessorSummary(accessorIndex)]),
      ),
    })),
  })),
};

console.log(JSON.stringify(report, null, 2));
