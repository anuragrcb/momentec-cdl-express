import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const assetDir = path.join(process.cwd(), "assets", "augusta-live", "baseball", "J180A");
const files = ["J180A.glb", "J180A_S.glb", "J180A_L.glb"];

const componentByteSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.toString("utf8", 0, 4) !== "glTF") throw new Error(`${filePath} is not a GLB`);
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
  if (!json || !binary) throw new Error(`Missing GLB chunks in ${filePath}`);
  return { data, json, binary };
}

function readerFor(json, binary) {
  return function readAccessor(index) {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const bytes = componentByteSize[accessor.componentType];
    const count = componentCount[accessor.type];
    const stride = bufferView.byteStride || bytes * count;
    const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const read = accessor.componentType === 5126
      ? (byte) => view.getFloat32(byte, true)
      : accessor.componentType === 5125
        ? (byte) => view.getUint32(byte, true)
        : accessor.componentType === 5123
          ? (byte) => view.getUint16(byte, true)
          : accessor.componentType === 5122
            ? (byte) => view.getInt16(byte, true)
            : accessor.componentType === 5120
              ? (byte) => view.getInt8(byte)
              : (byte) => view.getUint8(byte);
    return Array.from({ length: accessor.count }, (_, row) =>
      Array.from({ length: count }, (_, column) => read(base + row * stride + column * bytes)),
    );
  };
}

function primitiveSummary(json, readAccessor, primitive, primitiveIndex) {
  const positions = primitive.attributes?.POSITION !== undefined ? readAccessor(primitive.attributes.POSITION) : [];
  const uvs = primitive.attributes?.TEXCOORD_0 !== undefined ? readAccessor(primitive.attributes.TEXCOORD_0) : [];
  const bounds = (rows, dimension) => rows.length
    ? [Math.min(...rows.map((row) => row[dimension])), Math.max(...rows.map((row) => row[dimension]))]
    : null;
  return {
    primitiveIndex,
    materialIndex: primitive.material ?? null,
    materialName: primitive.material !== undefined ? json.materials?.[primitive.material]?.name ?? null : null,
    vertexCount: positions.length,
    indexCount: primitive.indices !== undefined ? json.accessors[primitive.indices].count : null,
    positionBounds: positions.length ? [bounds(positions, 0), bounds(positions, 1), bounds(positions, 2)] : null,
    uvBounds: uvs.length ? [bounds(uvs, 0), bounds(uvs, 1)] : null,
    attributes: Object.keys(primitive.attributes || {}),
  };
}

const reports = files.map((filename) => {
  const filePath = path.join(assetDir, filename);
  const { data, json, binary } = parseGlb(filePath);
  const readAccessor = readerFor(json, binary);
  return {
    filename,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    byteLength: data.length,
    asset: json.asset,
    sceneCount: json.scenes?.length ?? 0,
    nodeCount: json.nodes?.length ?? 0,
    materials: (json.materials || []).map((material, index) => ({
      index,
      name: material.name || `material-${index}`,
      baseColorTextureIndex: material.pbrMetallicRoughness?.baseColorTexture?.index ?? null,
      baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor ?? null,
      normalTextureIndex: material.normalTexture?.index ?? null,
      alphaMode: material.alphaMode ?? "OPAQUE",
      doubleSided: Boolean(material.doubleSided),
    })),
    textures: (json.textures || []).map((texture, index) => ({ index, source: texture.source ?? null, sampler: texture.sampler ?? null })),
    images: (json.images || []).map((image, index) => ({
      index,
      name: image.name ?? null,
      mimeType: image.mimeType ?? null,
      uri: image.uri ?? null,
      byteLength: image.bufferView !== undefined ? json.bufferViews?.[image.bufferView]?.byteLength ?? null : null,
    })),
    meshes: (json.meshes || []).map((mesh, meshIndex) => ({
      meshIndex,
      name: mesh.name || `mesh-${meshIndex}`,
      primitives: (mesh.primitives || []).map((primitive, primitiveIndex) =>
        primitiveSummary(json, readAccessor, primitive, primitiveIndex),
      ),
    })),
  };
});

const topologySignatures = reports.map((report) => ({
  filename: report.filename,
  signature: JSON.stringify(report.meshes.map((mesh) => ({
    name: mesh.name,
    primitives: mesh.primitives.map((primitive) => ({
      materialName: primitive.materialName,
      vertexCount: primitive.vertexCount,
      indexCount: primitive.indexCount,
      uvBounds: primitive.uvBounds,
    })),
  }))),
}));

console.log(JSON.stringify({
  style: "J180A",
  reports,
  topologyMatches: topologySignatures.map((entry) => ({
    filename: entry.filename,
    sameAsBase: entry.signature === topologySignatures[0].signature,
  })),
}, null, 2));
