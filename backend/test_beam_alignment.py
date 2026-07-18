"""Test beam mesh alignment + solver with beam elements."""
import sys, json, numpy as np
sys.path.insert(0, ".")
from models import SlabGeometry, MeshRequest, Point2D, BeamDef, FEMMesh, AnalysisRequest
from mesher import generate_mesh
from solver import analyze_slab

# 8m x 6m slab with 4 columns and a beam across the short span
geo = SlabGeometry(
    vertices=[
        Point2D(x=0, y=0), Point2D(x=8, y=0),
        Point2D(x=8, y=6), Point2D(x=0, y=6)
    ],
    columns=[],
    beams=[
        BeamDef(startPoint=Point2D(x=0, y=3), endPoint=Point2D(x=8, y=3)),
    ]
)

req = MeshRequest(geometry=geo, meshSize=0.5, refineAtColumns=False)
mesh = generate_mesh(req)
print(f"Mesh: {mesh.nodeCount} nodes, {mesh.elementCount} elements")
print(f"Quality: {mesh.meshQuality}, minAngle={mesh.minAngle}")

# Find beam nodes (on y=3)
tol = 0.01
beam_nodes = sorted([n for n in mesh.nodes if abs(n.y - 3) < tol], key=lambda n: n.x)
print(f"Beam-aligned nodes: {len(beam_nodes)}")
print(f"X coords: {[round(n.x,4) for n in beam_nodes]}")

# Verify beam endpoint nodes exist
start_node = [n for n in beam_nodes if abs(n.x) < tol]
end_node = [n for n in beam_nodes if abs(n.x - 8) < tol]
assert len(start_node) >= 1, "Missing node at beam start (0,3)"
assert len(end_node) >= 1, "Missing node at beam end (8,3)"
print(f"Nodes at beam start: {len(start_node)}, end: {len(end_node)} [OK]")

# Build beam element data: connect consecutive beam nodes
beam_node_id_a = []
beam_node_id_b = []
for i in range(len(beam_nodes) - 1):
    beam_node_id_a.append(beam_nodes[i].id)
    beam_node_id_b.append(beam_nodes[i + 1].id)
print(f"Beam elements: {len(beam_node_id_a)}")

# Wall supports on all 4 edges
wall_ids = []
for n in mesh.nodes:
    if (abs(n.x) < tol or abs(n.x - 8) < tol or
        abs(n.y) < tol or abs(n.y - 6) < tol):
        wall_ids.append(n.id)

# Column supports at 4 interior points
col_positions = [(2, 2), (6, 2), (2, 4), (6, 4)]
col_node_ids = []
col_heights = []
col_widths = []
col_depths = []
for cx, cy in col_positions:
    best = min(mesh.nodes, key=lambda n: (n.x - cx)**2 + (n.y - cy)**2)
    col_node_ids.append(best.id)
    col_heights.append(3.0)
    col_widths.append(0.3)
    col_depths.append(0.3)

# Column rotational stiffness
I_col = 0.3 * 0.3**3 / 12
E_col = 25e9
k_rot = 4 * E_col * I_col / 3.0
col_stiffnesses = [k_rot] * 4

# Analysis request
ar = AnalysisRequest(
    mesh=mesh,
    thickness=0.2,
    elasticModulus=25e9,
    poissonRatio=0.2,
    uniformLoad=5.0,
    selfWeight=25 * 0.2,
    wallNodeIds=wall_ids,
    columnNodeIds=col_node_ids,
    columnHeights=col_heights,
    columnStiffnesses=col_stiffnesses,
    columnWidths=col_widths,
    columnDepths=col_depths,
    beamNodeIdA=beam_node_id_a,
    beamNodeIdB=beam_node_id_b,
    beamWidths=[0.3] * len(beam_node_id_a),
    beamDepths=[0.45] * len(beam_node_id_a),
    beamElasticModuli=[25e9] * len(beam_node_id_a),
)

result = analyze_slab(ar)
print(f"\nAnalysis: success={result.success}, solverTime={result.solverTime:.3f}s")
if result.success:
    print(f"wz: {result.minWz*1000:.4f}mm to {result.maxWz*1000:.4f}mm")
    print(f"Mx: {result.minMx/1000:.2f} to {result.maxMx/1000:.2f} kNm/m")
    print(f"My: {result.minMy/1000:.2f} to {result.maxMy/1000:.2f} kNm/m")
    print(f"Vx: {result.minVx/1000:.2f} to {result.maxVx/1000:.2f} kN/m")
    print(f"Vy: {result.minVy/1000:.2f} to {result.maxVy/1000:.2f} kN/m")
    print(f"Nx: {result.minNx/1000:.2f} to {result.maxNx/1000:.2f} kN/m")
    print(f"Ny: {result.minNy/1000:.2f} to {result.maxNy/1000:.2f} kN/m")
    print(f"Punching: {len(result.columnPunching)} checks")
    for p in result.columnPunching:
        print(f"  Column node {p.nodeId}: {p.force_kN:.1f}kN, ratio={p.ratio:.3f} ({p.status})")

    # Sanity checks
    assert abs(result.maxWz) < 0.1, f"Deflection too large: {result.maxWz*1000:.2f}mm"
    assert abs(result.maxWz) > 0.0001, f"Deflection too small: {result.maxWz*1000:.4f}mm"
    print("\nAll sanity checks PASS")
else:
    print(f"ERROR: {result.error}")
    sys.exit(1)
