import gmsh
import numpy as np
import threading
from typing import List, Tuple, Set
from models import SlabGeometry, FEMMesh, Triangle, Point2D, FEMNode, MeshRequest

_lock = threading.Lock()

# Initialize Gmsh at import time (main thread)
gmsh.initialize()
gmsh.option.setNumber("General.Terminal", 0)


def _ensure_gmsh():
    pass

def _point_on_segment(px: float, py: float, ax: float, ay: float,
                      bx: float, by: float, tol: float = 1e-8) -> bool:
    """Check if point (px,py) lies on segment AB (excluding endpoints)."""
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 < tol:
        return False
    t = ((px - ax) * dx + (py - ay) * dy) / length2
    if t < tol or t > 1 - tol:
        return False
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return (px - proj_x) ** 2 + (py - proj_y) ** 2 < tol


def generate_mesh(request: MeshRequest) -> FEMMesh:
    geo = request.geometry
    _ensure_gmsh()
    with _lock:
        gmsh.model.add("slab")

        slab_verts = []
        for v in geo.vertices:
            if not slab_verts or np.hypot(v.x - slab_verts[-1][0], v.y - slab_verts[-1][1]) > 1e-6:
                slab_verts.append((v.x, v.y))
        if len(slab_verts) >= 3 and np.hypot(slab_verts[0][0] - slab_verts[-1][0], slab_verts[0][1] - slab_verts[-1][1]) < 1e-6:
            slab_verts.pop()

        # --- Build boundary points, splitting edges at beam and wall endpoints ---
        support_endpoints = []
        if geo.beams:
            for beam in geo.beams:
                support_endpoints.append((beam.startPoint.x, beam.startPoint.y))
                support_endpoints.append((beam.endPoint.x, beam.endPoint.y))
        if geo.walls:
            for wall in geo.walls:
                support_endpoints.append((wall.startPoint.x, wall.startPoint.y))
                support_endpoints.append((wall.endPoint.x, wall.endPoint.y))

        # For each slab edge, check if any support endpoint lies on it
        split_edges = []  # list of list of (x, y) along each original edge (including endpoints)
        nv = len(slab_verts)
        for i in range(nv):
            ax, ay = slab_verts[i]
            bx, by = slab_verts[(i + 1) % nv]
            pts = [(ax, ay)]
            for ep_x, ep_y in support_endpoints:
                if _point_on_segment(ep_x, ep_y, ax, ay, bx, by):
                    pts.append((ep_x, ep_y))
            pts.append((bx, by))
            # Sort along the edge by distance from A
            dx, dy = bx - ax, by - ay
            len2 = dx * dx + dy * dy
            if len2 > 1e-12:
                pts.sort(key=lambda p: ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)
            split_edges.append(pts)

        # Create Gmsh points (deduplicated) — boundary vertices first
        point_tags = {}
        next_pt_tag = 1000
        for edge_pts in split_edges:
            for (x, y) in edge_pts:
                key = (x, y)
                if key not in point_tags:
                    point_tags[key] = next_pt_tag
                    gmsh.model.occ.addPoint(x, y, 0, tag=next_pt_tag)
                    next_pt_tag += 1

        # Add interior beam and wall endpoints (not on boundary)
        if geo.beams:
            for beam in geo.beams:
                for (ep_x, ep_y) in [(beam.startPoint.x, beam.startPoint.y),
                                     (beam.endPoint.x, beam.endPoint.y)]:
                    key = (ep_x, ep_y)
                    if key not in point_tags:
                        point_tags[key] = next_pt_tag
                        gmsh.model.occ.addPoint(ep_x, ep_y, 0, tag=next_pt_tag)
                        next_pt_tag += 1
        if geo.walls:
            for wall in geo.walls:
                for (ep_x, ep_y) in [(wall.startPoint.x, wall.startPoint.y),
                                     (wall.endPoint.x, wall.endPoint.y)]:
                    key = (ep_x, ep_y)
                    if key not in point_tags:
                        point_tags[key] = next_pt_tag
                        gmsh.model.occ.addPoint(ep_x, ep_y, 0, tag=next_pt_tag)
                        next_pt_tag += 1

        # Create boundary lines from split edges
        line_tags = []
        existing_edges = set()
        next_line_tag = 2000
        for edge_pts in split_edges:
            for i in range(len(edge_pts) - 1):
                pa = edge_pts[i]
                pb = edge_pts[i + 1]
                ta, tb = point_tags[pa], point_tags[pb]
                if ta == tb:
                    continue
                edge_key = (min(ta, tb), max(ta, tb))
                if edge_key not in existing_edges:
                    gmsh.model.occ.addLine(ta, tb, tag=next_line_tag)
                    line_tags.append(next_line_tag)
                    existing_edges.add(edge_key)
                    next_line_tag += 1

        curve_loop = gmsh.model.occ.addCurveLoop(line_tags, tag=3000)
        slab_surf = gmsh.model.occ.addPlaneSurface([curve_loop], tag=4000)

        for i, opening in enumerate(geo.openings):
            hole_verts = []
            for v in opening.vertices:
                if not hole_verts or np.hypot(v.x - hole_verts[-1][0], v.y - hole_verts[-1][1]) > 1e-6:
                    hole_verts.append((v.x, v.y))
            if len(hole_verts) >= 3 and np.hypot(hole_verts[0][0] - hole_verts[-1][0], hole_verts[0][1] - hole_verts[-1][1]) < 1e-6:
                hole_verts.pop()
            
            if len(hole_verts) < 3:
                continue

            hole_pt_tags = []
            for j, (x, y) in enumerate(hole_verts):
                pt = gmsh.model.occ.addPoint(x, y, 0, tag=5000 + i * 100 + j)
                hole_pt_tags.append(pt)
            hole_line_tags = []
            for j in range(len(hole_pt_tags)):
                k = (j + 1) % len(hole_pt_tags)
                if hole_pt_tags[j] == hole_pt_tags[k]:
                    continue
                line = gmsh.model.occ.addLine(hole_pt_tags[j], hole_pt_tags[k], tag=6000 + i * 100 + j)
                hole_line_tags.append(line)
                existing_edges.add((min(hole_pt_tags[j], hole_pt_tags[k]), max(hole_pt_tags[j], hole_pt_tags[k])))
            hole_loop = gmsh.model.occ.addCurveLoop(hole_line_tags, tag=7000 + i)
            gmsh.model.occ.cut([(2, slab_surf)], [(2, gmsh.model.occ.addPlaneSurface([hole_loop]))], removeObject=True)

        # --- Create beam and wall lines (embedded curves for mesh alignment) ---
        embedded_curve_tags = []
        if geo.beams:
            for beam in geo.beams:
                p1 = point_tags.get((beam.startPoint.x, beam.startPoint.y))
                p2 = point_tags.get((beam.endPoint.x, beam.endPoint.y))
                if p1 and p2 and p1 != p2:
                    edge_key = (min(p1, p2), max(p1, p2))
                    if edge_key not in existing_edges:
                        gmsh.model.occ.addLine(p1, p2, tag=next_line_tag)
                        embedded_curve_tags.append(next_line_tag)
                        existing_edges.add(edge_key)
                        next_line_tag += 1
        if geo.walls:
            for wall in geo.walls:
                p1 = point_tags.get((wall.startPoint.x, wall.startPoint.y))
                p2 = point_tags.get((wall.endPoint.x, wall.endPoint.y))
                if p1 and p2 and p1 != p2:
                    edge_key = (min(p1, p2), max(p1, p2))
                    if edge_key not in existing_edges:
                        gmsh.model.occ.addLine(p1, p2, tag=next_line_tag)
                        embedded_curve_tags.append(next_line_tag)
                        existing_edges.add(edge_key)
                        next_line_tag += 1

        col_pt_tags = []
        if request.refineAtColumns and geo.columns:
            for col in geo.columns:
                col_key = (col.position.x, col.position.y)
                if col_key in point_tags:
                    pt = point_tags[col_key]
                else:
                    pt = next_pt_tag
                    gmsh.model.occ.addPoint(col.position.x, col.position.y, 0, tag=next_pt_tag)
                    point_tags[col_key] = next_pt_tag
                    next_pt_tag += 1
                if pt not in col_pt_tags:
                    col_pt_tags.append(pt)

        gmsh.model.occ.synchronize()

        # Embed beam and wall curves into the slab surface for mesh alignment
        if embedded_curve_tags:
            gmsh.model.mesh.embed(1, embedded_curve_tags, 2, slab_surf)

        gmsh.option.setNumber("Mesh.CharacteristicLengthMin", request.meshSize * 0.3)
        gmsh.option.setNumber("Mesh.CharacteristicLengthMax", request.meshSize)
        gmsh.option.setNumber("Mesh.MinimumCirclePoints", 12)

        if col_pt_tags:
            dist_field = gmsh.model.mesh.field.add("Distance")
            gmsh.model.mesh.field.setNumbers(dist_field, "PointsList", col_pt_tags)
            threshold_field = gmsh.model.mesh.field.add("Threshold")
            gmsh.model.mesh.field.setNumber(threshold_field, "InField", dist_field)
            gmsh.model.mesh.field.setNumber(threshold_field, "SizeMin", request.meshSize * 0.35)
            gmsh.model.mesh.field.setNumber(threshold_field, "SizeMax", request.meshSize)
            gmsh.model.mesh.field.setNumber(threshold_field, "DistMin", 0.5)
            gmsh.model.mesh.field.setNumber(threshold_field, "DistMax", 2.0)
            gmsh.model.mesh.field.setAsBackgroundMesh(threshold_field)
        else:
            const_field = gmsh.model.mesh.field.add("Constant")
            gmsh.model.mesh.field.setNumber(const_field, "VIn", request.meshSize)
            gmsh.model.mesh.field.setAsBackgroundMesh(const_field)

        gmsh.model.mesh.generate(2)
        gmsh.model.mesh.optimize("Netgen")

        # Extract nodes and elements BEFORE clear
        node_tags, node_coords, _ = gmsh.model.mesh.getNodes()
        elem_types, elem_tags, elem_node_tags = gmsh.model.mesh.getElements(dim=2)

        gmsh.clear()

    # --- Deduplicate nodes ---
    coord_to_tag: dict = {}
    unique_tags = []
    for i in range(0, len(node_coords), 3):
        key = (round(node_coords[i], 10), round(node_coords[i+1], 10))
        if key not in coord_to_tag:
            coord_to_tag[key] = node_tags[i // 3]
            unique_tags.append(node_tags[i // 3])

    node_id_map = {old: new for new, old in enumerate(unique_tags, 1)}
    nodes_list = []
    new_id = 1
    for i in range(0, len(node_coords), 3):
        if node_tags[i // 3] in unique_tags:
            nodes_list.append(FEMNode(id=new_id, x=node_coords[i], y=node_coords[i+1]))
            new_id += 1

    # --- Extract triangles with deduped node IDs ---
    triangles = []
    seen_tri = set()
    elem_id = 0
    for typ, tags, conn in zip(elem_types, elem_tags, elem_node_tags):
        if typ == 2:
            npe = 3
            for i in range(0, len(conn), npe):
                tri_nodes = tuple(
                    sorted([node_id_map[conn[i+j]] for j in range(npe)
                           if conn[i+j] in node_id_map])
                )
                if len(tri_nodes) == 3 and tri_nodes not in seen_tri:
                    seen_tri.add(tri_nodes)
                    triangles.append(Triangle(nodeIds=list(tri_nodes), id=elem_id))
                    elem_id += 1

    min_angle, max_ar = _compute_mesh_quality(nodes_list, triangles) if triangles else (90, 1)
    quality = "excellent" if min_angle > 25 else "good" if min_angle > 15 else "poor"

    # Identify unconnected node IDs (nodes not in any element)
    connected_node_ids = set()
    for tri in triangles:
        for nid in tri.nodeIds:
            connected_node_ids.add(nid)
    unconnected_node_ids = [n.id for n in nodes_list if n.id not in connected_node_ids]

    return FEMMesh(
        nodes=nodes_list, elements=triangles,
        nodeCount=len(nodes_list), elementCount=len(triangles),
        minAngle=round(min_angle, 1), maxAspectRatio=round(max_ar, 2),
        meshQuality=quality,
        unconnectedNodeIds=unconnected_node_ids
    )


def _compute_mesh_quality(nodes: List[FEMNode], elements: List[Triangle]) -> Tuple[float, float]:
    min_angle = 180.0
    max_ar = 0.0
    node_map = {n.id: np.array([n.x, n.y]) for n in nodes}
    for tri in elements:
        ids = tri.nodeIds
        p = [node_map[i] for i in ids]
        edge_lens = [np.linalg.norm(p[(i+1) % 3] - p[i]) for i in range(3)]
        angles = []
        for i in range(3):
            v1 = p[(i+1) % 3] - p[i]
            v2 = p[(i-1) % 3] - p[i]
            dot = np.dot(v1, v2)
            norm = np.linalg.norm(v1) * np.linalg.norm(v2)
            if norm > 1e-15:
                ang = np.degrees(np.arccos(np.clip(dot / norm, -1, 1)))
                angles.append(ang)
        if angles:
            min_angle = min(min_angle, min(angles))
        s = sum(edge_lens) / 2
        if s > 0:
            area = np.sqrt(max(0, s * (s - edge_lens[0]) * (s - edge_lens[1]) * (s - edge_lens[2])))
            if area > 0:
                r_circum = edge_lens[0] * edge_lens[1] * edge_lens[2] / (4 * area)
                r_in = area / s
                ar = r_circum / r_in if r_in > 0 else 100
                max_ar = max(max_ar, ar)
    return min_angle, max_ar
