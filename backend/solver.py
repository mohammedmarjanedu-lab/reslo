import numpy as np
from scipy.sparse import lil_matrix, csr_matrix
from scipy.sparse.linalg import spsolve
from typing import List, Tuple
import time
import warnings
from models import FEMMesh, Triangle, Point2D
from models import (
    AnalysisRequest, AnalysisResponse,
    NodeDeflection, ElementMoment, ElementStress, ElementShear,
    ElementMembraneForce, PunchingStress
)

# DOF offsets per node (flat shell: u, v, w, θx, θy, θz)
U, V, W, RX, RY, RZ = 0, 1, 2, 3, 4, 5
NDOF_PER_NODE = 6

def _rect_torsion_constant(b: float, d: float) -> float:
    """Saint-Venant torsional constant (J) for a rectangular section.
    b = width (shorter side if unequal), d = depth (longer side).
    """
    w = min(b, d)
    h = max(b, d)
    if w < 1e-12 or h < 1e-12:
        return 0.0
    r = w / h
    return h * w**3 * (1/3 - 0.21 * r * (1 - r**4 / 12))

# Gauss points for triangle (3-point, exact for quadratic)
GAUSS_PTS = [
    (1/6, 1/6, 2/3, 1/3),
    (1/6, 2/3, 1/6, 1/3),
    (2/3, 1/6, 1/6, 1/3),
]


# Shape functions for 6-node quadratic triangle (area coordinates)
def _shape_n6(L1, L2, L3):
    N = np.zeros(6)
    N[0] = L1 * (2*L1 - 1)
    N[1] = L2 * (2*L2 - 1)
    N[2] = L3 * (2*L3 - 1)
    N[3] = 4 * L1 * L2
    N[4] = 4 * L2 * L3
    N[5] = 4 * L3 * L1
    return N

def _dshape_n6(L1, L2, L3):
    dN = np.zeros((6, 2))
    dN[0] = [4*L1 - 1, 0]
    dN[1] = [0, 4*L2 - 1]
    dN[2] = [-4*L3 + 1, -4*L3 + 1]
    dN[3] = [4*L2, 4*L1]
    dN[4] = [-4*L2, 4*(L3 - L2)]
    dN[5] = [4*(L3 - L1), -4*L1]
    return dN

def _d2shape_n6(L1, L2, L3):
    """Second derivatives of 6-node quadratic shape functions wrt area coords (L1,L2)."""
    d2N = np.zeros((6, 3))  # [i, {d2/dL1², d2/dL1dL2, d2/dL2²}]
    # N0 = L1(2L1-1) = 2L1² - L1
    d2N[0] = [4, 0, 0]
    # N1 = L2(2L2-1) = 2L2² - L2
    d2N[1] = [0, 0, 4]
    # N2 = L3(2L3-1) with L3=1-L1-L2
    d2N[2] = [4, 4, 4]
    # N3 = 4L1L2
    d2N[3] = [0, 4, 0]
    # N4 = 4L2L3 = 4L2(1-L1-L2)
    d2N[4] = [0, -4, -8]
    # N5 = 4L3L1 = 4(1-L1-L2)L1
    d2N[5] = [-8, -4, 0]
    return d2N


def compute_element_shears(
    nodes_xy: np.ndarray,
    u_elem: np.ndarray,
    D: np.ndarray
) -> Tuple[float, float]:
    """Compute element centroid shear forces Vx, Vy (N/m) from moment gradients.
    Vx = ∂Mx/∂x + ∂Mxy/∂y,  Vy = ∂Mxy/∂x + ∂My/∂y
    Uses second derivatives of quadratic shape functions.
    """
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    if A < 1e-15:
        return (0, 0)

    J = np.array([[x[0]-x[2], x[1]-x[2]],
                  [y[0]-y[2], y[1]-y[2]]])
    invJ = np.linalg.inv(J)
    a, b = invJ[0, 0], invJ[0, 1]  # dL1/dx, dL1/dy
    c, d = invJ[1, 0], invJ[1, 1]  # dL2/dx, dL2/dy

    L1 = L2 = L3 = 1/3  # centroid
    d2N = _d2shape_n6(L1, L2, L3)

    # Transform second derivatives from (L1,L2) coords to (x,y) coords
    # d2f_dx2 = d2f/dL1²*a² + 2*d2f/dL1dL2*a*c + d2f/dL2²*c²
    # d2f_dxdy = d2f/dL1²*a*b + d2f/dL1dL2*(a*d+b*c) + d2f/dL2²*c*d
    # d2f_dy2 = d2f/dL1²*b² + 2*d2f/dL1dL2*b*d + d2f/dL2²*d²
    d2N_dx2 = np.zeros(6)
    d2N_dxdy = np.zeros(6)
    d2N_dy2 = np.zeros(6)
    for i in range(6):
        d2N_dx2[i] = d2N[i,0]*a*a + 2*d2N[i,1]*a*c + d2N[i,2]*c*c
        d2N_dxdy[i] = d2N[i,0]*a*b + d2N[i,1]*(a*d+b*c) + d2N[i,2]*c*d
        d2N_dy2[i] = d2N[i,0]*b*b + 2*d2N[i,1]*b*d + d2N[i,2]*d*d

    # Bx = ∂B/∂x, By = ∂B/∂y (both 3×12)
    Bx = np.zeros((3, 12))
    By = np.zeros((3, 12))
    for i in range(6):
        Bx[0, 2*i] = d2N_dx2[i]      # ∂κx/∂x = ∂²βx/∂x²
        Bx[1, 2*i+1] = d2N_dxdy[i]   # ∂κy/∂x = ∂²βy/∂x∂y
        Bx[2, 2*i] = d2N_dxdy[i]     # ∂κxy/∂x = ∂²βx/∂x∂y
        Bx[2, 2*i+1] = d2N_dx2[i]    # ∂κxy/∂x += ∂²βy/∂x²
        By[0, 2*i] = d2N_dxdy[i]     # ∂κx/∂y = ∂²βx/∂x∂y
        By[1, 2*i+1] = d2N_dy2[i]    # ∂κy/∂y = ∂²βy/∂y²
        By[2, 2*i] = d2N_dy2[i]      # ∂κxy/∂y = ∂²βx/∂y²
        By[2, 2*i+1] = d2N_dxdy[i]   # ∂κxy/∂y += ∂²βy/∂x∂y

    # Vx = D[0,:] @ Bx + D[2,:] @ By  → (12,) vector
    # Vy = D[2,:] @ Bx + D[1,:] @ By  → (12,) vector
    Vx_vec = D[0,0]*Bx[0] + D[0,1]*Bx[1] + D[0,2]*Bx[2] \
           + D[2,0]*By[0] + D[2,1]*By[1] + D[2,2]*By[2]
    Vy_vec = D[2,0]*Bx[0] + D[2,1]*Bx[1] + D[2,2]*Bx[2] \
           + D[1,0]*By[0] + D[1,1]*By[1] + D[1,2]*By[2]

    T = _build_T(nodes_xy)
    vx = float(Vx_vec @ T @ u_elem)
    vy = float(Vy_vec @ T @ u_elem)
    return (vx, vy)


def compute_dkt_stiffness(
    nodes_xy: np.ndarray,
    D: np.ndarray
) -> np.ndarray:
    """Compute 9×9 DKT element stiffness matrix.
    nodes_xy: (3, 2) array of node coordinates (CCW order assumed)
    D: (3, 3) plate bending constitutive matrix
    """
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]

    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    if A < 1e-15:
        return np.zeros((9, 9))

    edges = [(0, 1), (1, 2), (2, 0)]
    edge_info = []
    for i, j in edges:
        dx = x[j] - x[i]
        dy = y[j] - y[i]
        L = np.sqrt(dx*dx + dy*dy) or 1e-15
        edge_info.append({'tx': dx/L, 'ty': dy/L, 'L': L, 'i': i, 'j': j})

    # Jacobian for (L1, L2) → (x, y), where L3 = 1-L1-L2
    # x = x2 + (x0-x2)*L1 + (x1-x2)*L2,  y = y2 + (y0-y2)*L1 + (y1-y2)*L2
    J = np.array([[x[0]-x[2], x[1]-x[2]],
                  [y[0]-y[2], y[1]-y[2]]])
    invJ = np.linalg.inv(J)

    # Transformation T (12×9): corner DOFs → 6-node (12) β DOFs
    # 12 β DOFs: [βx₁,βy₁, βx₂,βy₂, βx₃,βy₃, βx₄,βy₄, βx₅,βy₅, βx₆,βy₆]
    # 9 corner DOFs: [w₁,θx₁,θy₁, w₂,θx₂,θy₂, w₃,θx₃,θy₃]
    # Mid-side nodes: β₄ on edge 0→1, β₅ on edge 1→2, β₆ on edge 2→0
    T = np.zeros((12, 9))
    for n in range(3):
        T[2*n, 3*n+1] = 1.0  # βxn = θxn
        T[2*n+1, 3*n+2] = 1.0  # βyn = θyn

    for k, ed in enumerate(edge_info):
        i, j, tx, ty, Lk = ed['i'], ed['j'], ed['tx'], ed['ty'], ed['L']
        r6, r7 = 6 + 2*k, 6 + 2*k + 1
        c = 3 / (2 * Lk)

        # w contributions: βs_mid = (3/(2L))(wj - wi) - 1/4(βsi+βsj)
        # βx_mid = -βn_mid·ty + βs_mid·tx
        # βy_mid = βn_mid·tx + βs_mid·ty
        T[r6, 3*i] = -tx * c
        T[r7, 3*i] = -ty * c
        T[r6, 3*j] = tx * c
        T[r7, 3*j] = ty * c

        # Rotation contributions: βn_mid = (βni+βnj)/2, βs_mid = -1/4(βsi+βsj)
        # βx_mid = -ty·βn_mid + tx·βs_mid
        #        = -ty·1/2(-βxi·ty+βyi·tx -βxj·ty+βyj·tx) + tx·(-1/4)(βxi·tx+βyi·ty + βxj·tx+βyj·ty)
        c1 = 0.5*ty*ty - 0.25*tx*tx   # βxi → βx_mid
        c2 = -0.75*tx*ty               # βyi → βx_mid
        c3 = -0.75*tx*ty               # βxi → βy_mid
        c4 = 0.5*tx*tx - 0.25*ty*ty   # βyi → βy_mid
        for idx in [i, j]:
            T[r6, 3*idx+1] = c1
            T[r6, 3*idx+2] = c2
            T[r7, 3*idx+1] = c3
            T[r7, 3*idx+2] = c4

    # K_12 = ∫ B^T D B dA (3 Gauss points, exact for quadratic)
    K12 = np.zeros((12, 12))
    for L1, L2, L3, w in GAUSS_PTS:
        dN = _dshape_n6(L1, L2, L3)
        dNdx = dN[:, 0] * invJ[0, 0] + dN[:, 1] * invJ[1, 0]
        dNdy = dN[:, 0] * invJ[0, 1] + dN[:, 1] * invJ[1, 1]

        B = np.zeros((3, 12))
        B[0, 0::2] = dNdx  # κx = ∂βx/∂x
        B[1, 1::2] = dNdy  # κy = ∂βy/∂y
        B[2, 0::2] = dNdy  # κxy = ∂βx/∂y
        B[2, 1::2] = dNdx  # κxy += ∂βy/∂x

        K12 += B.T @ D @ B * w * A

    K9 = T.T @ K12 @ T
    return (K9 + K9.T) / 2


def compute_element_load(nodes_xy: np.ndarray, q: float) -> np.ndarray:
    """Consistent load vector (9,) for uniform pressure q (N/m²)."""
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    f = np.zeros(9)
    # Consistent load using DKT element kinematic interpolation
    f[0] = q * A / 3
    f[1] = q * A * (x[1] + x[2] - 2 * x[0]) / 24
    f[2] = q * A * (y[1] + y[2] - 2 * y[0]) / 24
    
    f[3] = q * A / 3
    f[4] = q * A * (x[2] + x[0] - 2 * x[1]) / 24
    f[5] = q * A * (y[2] + y[0] - 2 * y[1]) / 24
    
    f[6] = q * A / 3
    f[7] = q * A * (x[0] + x[1] - 2 * x[2]) / 24
    f[8] = q * A * (y[0] + y[1] - 2 * y[2]) / 24
    return f


def compute_cst_stiffness(
    nodes_xy: np.ndarray,
    E: float, nu: float, t: float
) -> np.ndarray:
    """Compute 6×6 CST membrane stiffness matrix (plane stress).
    nodes_xy: (3, 2) array of node coordinates
    DOF order: [u1, v1, u2, v2, u3, v3]
    """
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    if A < 1e-15:
        return np.zeros((6, 6))

    # B matrix (constant for CST): {ε} = [B]{u}
    B = np.zeros((3, 6))
    B[0, 0] = y[1] - y[2]
    B[1, 1] = x[2] - x[1]
    B[2, 0] = x[2] - x[1]
    B[2, 1] = y[1] - y[2]

    B[0, 2] = y[2] - y[0]
    B[1, 3] = x[0] - x[2]
    B[2, 2] = x[0] - x[2]
    B[2, 3] = y[2] - y[0]

    B[0, 4] = y[0] - y[1]
    B[1, 5] = x[1] - x[0]
    B[2, 4] = x[1] - x[0]
    B[2, 5] = y[0] - y[1]
    B /= (2 * A)

    # Plane stress constitutive matrix
    C = E / (1 - nu**2)
    D = C * np.array([[1, nu, 0],
                      [nu, 1, 0],
                      [0, 0, (1 - nu) / 2]])

    K = t * A * B.T @ D @ B
    return K


def compute_element_membrane_force(
    nodes_xy: np.ndarray,
    u_mem: np.ndarray,
    E: float, nu: float, t: float
) -> Tuple[float, float, float]:
    """Compute element centroid membrane forces Nx, Ny, Nxy (N/m)."""
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    if A < 1e-15:
        return (0, 0, 0)

    B = np.zeros((3, 6))
    B[0, 0] = y[1] - y[2]
    B[1, 1] = x[2] - x[1]
    B[2, 0] = x[2] - x[1]
    B[2, 1] = y[1] - y[2]
    B[0, 2] = y[2] - y[0]
    B[1, 3] = x[0] - x[2]
    B[2, 2] = x[0] - x[2]
    B[2, 3] = y[2] - y[0]
    B[0, 4] = y[0] - y[1]
    B[1, 5] = x[1] - x[0]
    B[2, 4] = x[1] - x[0]
    B[2, 5] = y[0] - y[1]
    B /= (2 * A)

    C = E / (1 - nu**2)
    D = C * np.array([[1, nu, 0],
                      [nu, 1, 0],
                      [0, 0, (1 - nu) / 2]])

    strain = B @ u_mem
    stress = D @ strain
    nx = t * stress[0]
    ny = t * stress[1]
    nxy = t * stress[2]
    return (nx, ny, nxy)


def _build_T(nodes_xy: np.ndarray) -> np.ndarray:
    """Build 12×9 DKT transformation matrix (CCW ordering assumed)."""
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    edges = [(0, 1), (1, 2), (2, 0)]
    T = np.zeros((12, 9))
    for n in range(3):
        T[2*n, 3*n+1] = 1.0
        T[2*n+1, 3*n+2] = 1.0

    for k in range(3):
        i, j = edges[k]
        dx = x[j] - x[i]
        dy = y[j] - y[i]
        Lk = np.sqrt(dx*dx + dy*dy) or 1e-15
        tx, ty = dx/Lk, dy/Lk
        r6, r7 = 6 + 2*k, 6 + 2*k + 1
        c = 3 / (2 * Lk)
        T[r6, 3*i] = -tx * c
        T[r7, 3*i] = -ty * c
        T[r6, 3*j] = tx * c
        T[r7, 3*j] = ty * c
        c1 = 0.5*ty*ty - 0.25*tx*tx
        c2 = -0.75*tx*ty
        c3 = -0.75*tx*ty
        c4 = 0.5*tx*tx - 0.25*ty*ty
        for idx in [i, j]:
            T[r6, 3*idx+1] = c1
            T[r6, 3*idx+2] = c2
            T[r7, 3*idx+1] = c3
            T[r7, 3*idx+2] = c4
    return T

def compute_element_moments(
    nodes_xy: np.ndarray,
    u_elem: np.ndarray,
    D: np.ndarray
) -> Tuple[float, float, float]:
    """Compute element centroid moments Mx, My, Mxy."""
    x, y = nodes_xy[:, 0], nodes_xy[:, 1]
    A = 0.5 * abs((x[1]-x[0])*(y[2]-y[0]) - (x[2]-x[0])*(y[1]-y[0]))
    if A < 1e-15:
        return (0, 0, 0)

    J = np.array([[x[0]-x[2], x[1]-x[2]],
                  [y[0]-y[2], y[1]-y[2]]])
    invJ = np.linalg.inv(J)

    L1, L2, L3 = 1/3, 1/3, 1/3
    dN = _dshape_n6(L1, L2, L3)
    dNdx = dN[:, 0] * invJ[0, 0] + dN[:, 1] * invJ[1, 0]
    dNdy = dN[:, 0] * invJ[0, 1] + dN[:, 1] * invJ[1, 1]

    B = np.zeros((3, 12))
    B[0, 0::2] = dNdx
    B[1, 1::2] = dNdy
    B[2, 0::2] = dNdy
    B[2, 1::2] = dNdx

    T = _build_T(nodes_xy)
    curvatures = B @ T @ u_elem
    moments = D @ curvatures
    return (float(moments[0]), float(moments[1]), float(moments[2]))


def _shell_dofs(nid: int):
    """Return [u, v, w, θx, θy, θz] global DOF indices for node nid."""
    base = NDOF_PER_NODE * nid
    return [base + U, base + V, base + W, base + RX, base + RY, base + RZ]


def _bending_dofs(nid: int):
    """Return [w, θx, θy] global DOF indices for node nid (for DKT coupling)."""
    base = NDOF_PER_NODE * nid
    return [base + W, base + RX, base + RY]


def analyze_slab(request: AnalysisRequest) -> AnalysisResponse:
    t0 = time.time()
    mesh = request.mesh
    nn = mesh.nodeCount
    ne = len(mesh.elements)
    ndof = nn * NDOF_PER_NODE

    nodes_xy = np.array([[n.x, n.y] for n in mesh.nodes])

    # Build element connectivity (0-indexed), enforce CCW orientation
    elem_nodes = []
    for tri in mesh.elements:
        nids = [nid - 1 for nid in tri.nodeIds]
        x0, y0 = nodes_xy[nids[0]]
        x1, y1 = nodes_xy[nids[1]]
        x2, y2 = nodes_xy[nids[2]]
        signed_area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if signed_area < 0:
            nids[1], nids[2] = nids[2], nids[1]
        elem_nodes.append(nids)

    # Material
    E = request.elasticModulus
    if E < 1e9:
        raise ValueError(f"elasticModulus={E:.2e} Pa is implausibly low for concrete. Expected ~25e9 Pa (25 GPa). Check unit conversion (frontend kPa → Pa).")
    nu = request.poissonRatio
    h = request.thickness
    D0 = E * h**3 / (12 * (1 - nu**2))
    D_mat = D0 * np.array([
        [1, nu, 0],
        [nu, 1, 0],
        [0, 0, (1 - nu) / 2]
    ])

    # Assembly
    K = lil_matrix((ndof, ndof))
    f = np.zeros(ndof)
    q = (request.uniformLoad + request.selfWeight) * 1000  # kN/m² → N/m²

    # Map between 3-DOF (DKT) and 6-DOF (shell) indices per element
    # DKT DOFs per node: [w, θx, θy] → offsets in shell element: [W, RX, RY]
    bend_to_shell = [W, RX, RY]  # index i in 3-DOF → offset in 6-DOF
    # CST DOFs per node: [u, v] → offsets in shell element: [U, V]
    mem_to_shell = [U, V]

    for elem_idx, tri_nodes in enumerate(elem_nodes):
        xy = nodes_xy[tri_nodes]

        # CST membrane stiffness (6×6)
        Km = compute_cst_stiffness(xy, E, nu, h)
        # DKT bending stiffness (9×9)
        Kb = compute_dkt_stiffness(xy, D_mat)
        # Load vector (bending only — membrane loads are zero for flat slab)
        fe_bend = compute_element_load(xy, q)

        # Assemble into 18-DOF shell element matrix
        dofs_elem = []
        for nid in tri_nodes:
            dofs_elem.extend(_shell_dofs(nid))
        # Map: CST DOF (6) → shell DOF (18)
        cst_to_shell = []
        for n in range(3):
            for d in mem_to_shell:
                cst_to_shell.append(NDOF_PER_NODE * n + d)
        # Map: DKT DOF (9) → shell DOF (18)
        dkt_to_shell = []
        for n in range(3):
            for d in bend_to_shell:
                dkt_to_shell.append(NDOF_PER_NODE * n + d)

        # Assemble membrane stiffness
        for a in range(6):
            sa = cst_to_shell[a]
            for b in range(6):
                sb = cst_to_shell[b]
                if Km[a, b] != 0:
                    K[dofs_elem[sa], dofs_elem[sb]] += Km[a, b]

        # Assemble bending stiffness + load
        for a in range(9):
            sa = dkt_to_shell[a]
            if fe_bend[a] != 0:
                f[dofs_elem[sa]] += fe_bend[a]
            for b in range(9):
                sb = dkt_to_shell[b]
                if Kb[a, b] != 0:
                    K[dofs_elem[sa], dofs_elem[sb]] += Kb[a, b]

        # Assemble drilling stiffness to diagonal of RZ (theta_z) to prevent flat slab singularity
        A = 0.5 * abs((xy[1,0]-xy[0,0])*(xy[2,1]-xy[0,1]) - (xy[2,0]-xy[0,0])*(xy[1,1]-xy[0,1]))
        k_drill = 1e-6 * E * h * A
        for nid in tri_nodes:
            dof = NDOF_PER_NODE * nid + RZ
            K[dof, dof] += k_drill

    # Boundary conditions
    wall_nodes_set = set()
    wall_node_ids_set = set(request.wallNodeIds)
    for nid in wall_node_ids_set:
        wall_nodes_set.add(nid - 1)

    col_node_indices = []
    col_spring_map = {}
    col_dims_map = {}
    for nid, kth, wcol, dcol in zip(
        request.columnNodeIds, request.columnStiffnesses,
        request.columnWidths, request.columnDepths
    ):
        nidx = nid - 1
        col_node_indices.append(nidx)
        col_spring_map[nidx] = kth
        col_dims_map[nidx] = (wcol, dcol)

    # Beam elements: add 12x12 beam stiffness between node pairs
    if (len(request.beamNodeIdA) > 0 and len(request.beamNodeIdB) > 0
            and len(request.beamWidths) > 0 and len(request.beamDepths) > 0
            and len(request.beamElasticModuli) > 0):
        nu_beam = request.poissonRatio
        for b_idx in range(len(request.beamNodeIdA)):
            nA = request.beamNodeIdA[b_idx] - 1
            nB = request.beamNodeIdB[b_idx] - 1
            b_w = request.beamWidths[b_idx]
            b_d = request.beamDepths[b_idx]
            b_E = request.beamElasticModuli[b_idx]
            if nA < 0 or nB < 0 or nA >= nn or nB >= nn or nA == nB:
                continue
            dx = nodes_xy[nB, 0] - nodes_xy[nA, 0]
            dy = nodes_xy[nB, 1] - nodes_xy[nA, 1]
            L = np.sqrt(dx**2 + dy**2)
            if L < 1e-6:
                continue
            cos_a = dx / L
            sin_a = dy / L

            # Beam section properties
            A_sect = b_w * b_d
            Iy = b_w * b_d**3 / 12  # out-of-plane bending
            Iz = b_d * b_w**3 / 12  # in-plane bending
            J = _rect_torsion_constant(b_w, b_d)
            G = b_E / (2 * (1 + nu_beam))

            # 12x12 local stiffness matrix
            k_local = np.zeros((12, 12))
            
            # Axial stiffness
            k_axial = b_E * A_sect / L
            k_local[0, 0] = k_local[6, 6] = k_axial
            k_local[0, 6] = k_local[6, 0] = -k_axial
            
            # Torsional stiffness
            k_torsion = G * J / L
            k_local[3, 3] = k_local[9, 9] = k_torsion
            k_local[3, 9] = k_local[9, 3] = -k_torsion
            
            # Out-of-plane bending (local x-z plane)
            # local DOFs: w_A(2), θy_A(4), w_B(8), θy_B(10)
            EIy = b_E * Iy
            k_local[2, 2] = k_local[8, 8] = 12 * EIy / L**3
            k_local[2, 4] = k_local[4, 2] = -6 * EIy / L**2
            k_local[2, 8] = k_local[8, 2] = -12 * EIy / L**3
            k_local[2, 10] = k_local[10, 2] = -6 * EIy / L**2
            k_local[4, 4] = k_local[10, 10] = 4 * EIy / L
            k_local[4, 8] = k_local[8, 4] = 6 * EIy / L**2
            k_local[4, 10] = k_local[10, 4] = 2 * EIy / L
            k_local[8, 8] = 12 * EIy / L**3
            k_local[8, 10] = k_local[10, 8] = 6 * EIy / L**2
            
            # In-plane bending (local x-y plane)
            # local DOFs: v_A(1), θz_A(5), v_B(7), θz_B(11)
            EIz = b_E * Iz
            k_local[1, 1] = k_local[7, 7] = 12 * EIz / L**3
            k_local[1, 5] = k_local[5, 1] = 6 * EIz / L**2
            k_local[1, 7] = k_local[7, 1] = -12 * EIz / L**3
            k_local[1, 11] = k_local[11, 1] = 6 * EIz / L**2
            k_local[5, 5] = k_local[11, 11] = 4 * EIz / L
            k_local[5, 7] = k_local[7, 5] = -6 * EIz / L**2
            k_local[5, 11] = k_local[11, 5] = 2 * EIz / L
            k_local[7, 7] = 12 * EIz / L**3
            k_local[7, 11] = k_local[11, 7] = -6 * EIz / L**2

            # Slab eccentricity (rigid link offset e_z)
            e_z = 0.5 * (b_d - h)
            T_offset = np.eye(12)
            if abs(e_z) > 1e-6:
                T_offset[0, 4] = e_z
                T_offset[1, 3] = -e_z
                T_offset[6, 10] = e_z
                T_offset[7, 9] = -e_z
            
            # Apply offset transformation
            k_offset = T_offset.T @ k_local @ T_offset

            # Transformation from local 3D to global 3D coordinates
            R = np.array([
                [cos_a, sin_a, 0],
                [-sin_a, cos_a, 0],
                [0, 0, 1]
            ])
            T_rot = np.zeros((12, 12))
            for i in range(4):
                T_rot[3*i:3*i+3, 3*i:3*i+3] = R
            
            k_global = T_rot.T @ k_offset @ T_rot

            # Assemble global 12x12 matrix into global K (using 6 DOFs per node)
            dofs_A = _shell_dofs(nA)
            dofs_B = _shell_dofs(nB)
            dofs_beam = dofs_A + dofs_B
            for a_idx, dof_i in enumerate(dofs_beam):
                for b_idx2, dof_j in enumerate(dofs_beam):
                    if k_global[a_idx, b_idx2] != 0:
                        K[dof_i, dof_j] += k_global[a_idx, b_idx2]

    # Build column patches for multi-node footprint coupling
    col_node_patches = {}
    for nidx in col_node_indices:
        wcol, dcol = col_dims_map.get(nidx, (0.3, 0.3))
        xc = nodes_xy[nidx, 0]
        yc = nodes_xy[nidx, 1]
        
        # Find nodes within column footprint
        patch = []
        for n in range(nn):
            if (abs(nodes_xy[n, 0] - xc) <= wcol / 2 + 0.01 and
                    abs(nodes_xy[n, 1] - yc) <= dcol / 2 + 0.01):
                patch.append(n)
        if not patch:
            patch = [nidx]
        col_node_patches[nidx] = patch

    # Apply BCs: walls (u=v=w=0) + columns (u=v=w=0 for all patch nodes)
    constrained_dofs = set()
    for n in range(nn):
        if n in wall_nodes_set:
            constrained_dofs.add(NDOF_PER_NODE * n + U)
            constrained_dofs.add(NDOF_PER_NODE * n + V)
            constrained_dofs.add(NDOF_PER_NODE * n + W)
            
    for nidx, patch in col_node_patches.items():
        for n in patch:
            constrained_dofs.add(NDOF_PER_NODE * n + U)
            constrained_dofs.add(NDOF_PER_NODE * n + V)
            constrained_dofs.add(NDOF_PER_NODE * n + W)

    # Ensure enough constraints
    total_constrained = len(constrained_dofs)
    if total_constrained < 3:
        for n in range(min(3, nn)):
            base = NDOF_PER_NODE * n
            for d in [U, V, W]:
                constrained_dofs.add(base + d)

    free_dofs = [d for d in range(ndof) if d not in constrained_dofs]

    K_free = K[free_dofs, :][:, free_dofs].tocsc()
    f_free = f[free_dofs]

    # Column rotational springs (anisotropic, distributed over patch)
    for nidx, kth in col_spring_map.items():
        patch = col_node_patches.get(nidx, [nidx])
        wcol, dcol = col_dims_map.get(nidx, (0.3, 0.3))
        Ix = wcol * dcol**3 / 12
        Iy = dcol * wcol**3 / 12
        if Ix + Iy > 1e-12:
            kth_x = kth * (2 * Iy / (Ix + Iy))
            kth_y = kth * (2 * Ix / (Ix + Iy))
        else:
            kth_x = kth
            kth_y = kth

        kth_x_node = kth_x / len(patch)
        kth_y_node = kth_y / len(patch)

        for n in patch:
            dof_rx = NDOF_PER_NODE * n + RX
            dof_ry = NDOF_PER_NODE * n + RY

            if dof_rx in free_dofs:
                idx = free_dofs.index(dof_rx)
                K_free[idx, idx] += kth_x_node
            if dof_ry in free_dofs:
                idx = free_dofs.index(dof_ry)
                K_free[idx, idx] += kth_y_node

    # Wall rotational springs (distributed along each wall segment)
    if (len(request.wallStartPoints) > 0 and len(request.wallEndPoints) > 0
            and len(request.wallThicknesses) > 0 and len(request.wallHeights) > 0):
        G_val = E / (2 * (1 + nu))
        for w_idx in range(len(request.wallStartPoints)):
            w_start = request.wallStartPoints[w_idx]
            w_end = request.wallEndPoints[w_idx]
            w_t = request.wallThicknesses[w_idx]
            w_H = request.wallHeights[w_idx]
            
            dx = w_end.x - w_start.x
            dy = w_end.y - w_start.y
            Lw = np.sqrt(dx**2 + dy**2)
            if Lw < 1e-6 or w_H < 1e-6:
                continue
            cos_a = dx / Lw
            sin_a = dy / Lw
            
            # Wall total torsional stiffness
            kth_wall = (G_val * w_t**3 * Lw) / (6 * w_H)
            
            # Find nodes along this wall segment
            wall_seg_nodes = []
            tol = 0.05
            for nidx in range(nn):
                nx = nodes_xy[nidx, 0]
                ny = nodes_xy[nidx, 1]
                len2 = dx * dx + dy * dy
                t_val = ((nx - w_start.x) * dx + (ny - w_start.y) * dy) / len2
                if 0.0 - tol <= t_val <= 1.0 + tol:
                    px = w_start.x + np.clip(t_val, 0, 1) * dx
                    py = w_start.y + np.clip(t_val, 0, 1) * dy
                    if np.hypot(nx - px, ny - py) < tol:
                        wall_seg_nodes.append(nidx)
            
            if len(wall_seg_nodes) > 0:
                k_node = kth_wall / len(wall_seg_nodes)
                for nidx in wall_seg_nodes:
                    dof_rx = NDOF_PER_NODE * nidx + RX
                    dof_ry = NDOF_PER_NODE * nidx + RY
                    
                    if dof_rx in free_dofs:
                        idx_x = free_dofs.index(dof_rx)
                        K_free[idx_x, idx_x] += k_node * sin_a**2
                        if dof_ry in free_dofs:
                            idx_y = free_dofs.index(dof_ry)
                            K_free[idx_x, idx_y] += -k_node * sin_a * cos_a
                            K_free[idx_y, idx_x] += -k_node * sin_a * cos_a
                    if dof_ry in free_dofs:
                        idx_y = free_dofs.index(dof_ry)
                        K_free[idx_y, idx_y] += k_node * cos_a**2

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            u_free = spsolve(K_free, f_free)
        solver_time = time.time() - t0
    except Exception as e:
        return AnalysisResponse(success=False, error=f"Solver failed: {str(e)}")

    u = np.zeros(ndof)
    u[free_dofs] = u_free

    # Reactions
    K_csr = K.tocsr()
    reactions = np.zeros(ndof)
    for dof in constrained_dofs:
        r = 0.0
        row_start = K_csr.indptr[dof]
        row_end = K_csr.indptr[dof + 1]
        for j in range(row_start, row_end):
            col = K_csr.indices[j]
            r += K_csr.data[j] * u[col]
        reactions[dof] = r - f[dof]

    # Punching
    column_punching = []
    d_eff = max(0.1, h - 0.03)
    fck_MPa = (request.elasticModulus / 1e6 / 5000.0) ** 2
    fck_MPa = max(20, min(80, fck_MPa))
    v_c = 0.33 * np.sqrt(fck_MPa) * 1e6
    for nidx in col_node_indices:
        patch = col_node_patches.get(nidx, [nidx])
        V_col = sum(abs(reactions[NDOF_PER_NODE * n + W]) for n in patch)
        V_col_kN = V_col / 1000.0
        wcol, dcol = col_dims_map.get(nidx, (0.3, 0.3))
        b0 = 2 * (wcol + dcol + 2 * d_eff)
        v_u = V_col / (b0 * d_eff) if b0 > 0 else 0
        v_u_MPa = v_u / 1e6
        v_c_MPa = v_c / 1e6
        ratio = v_u / v_c if v_c > 0 else 0
        if ratio < 0.7:
            status = "OK"
        elif ratio < 1.0:
            status = "WARNING"
        else:
            status = "FAIL"
        column_punching.append(PunchingStress(
            nodeId=nidx + 1, force_kN=round(V_col_kN, 2),
            stress_MPa=round(v_u_MPa, 3), capacity_MPa=round(v_c_MPa, 3),
            ratio=round(ratio, 3), status=status
        ))

    # Node deflections
    node_deflections = []
    for n in range(nn):
        base = NDOF_PER_NODE * n
        node_deflections.append(NodeDeflection(
            nodeId=n + 1,
            u=float(u[base + U]),
            v=float(u[base + V]),
            wz=-float(u[base + W]),
            rx=float(u[base + RX]),
            ry=float(u[base + RY]),
            rz=float(u[base + RZ])
        ))

    # Element result recovery
    element_moments = []
    element_stresses = []
    element_shears = []
    element_membrane = []
    h_m = h
    min_mx = min_my = min_mxy = float('inf')
    max_mx = max_my = max_mxy = float('-inf')
    min_vx = min_vy = float('inf')
    max_vx = max_vy = float('-inf')
    min_nx = min_ny = min_nxy = float('inf')
    max_nx = max_ny = max_nxy = float('-inf')

    for elem_idx, tri_nodes in enumerate(elem_nodes):
        xy = nodes_xy[tri_nodes]

        # Extract bending DOFs (w, θx, θy) for DKT recovery
        bend_dofs = []
        mem_dofs = []
        for nid in tri_nodes:
            bend_dofs.extend(_bending_dofs(nid))
            base = NDOF_PER_NODE * nid
            mem_dofs.extend([base + U, base + V])
        u_bend = u[bend_dofs]
        u_mem = u[mem_dofs]

        # Membrane forces
        nx, ny, nxy = compute_element_membrane_force(xy, u_mem, E, nu, h)
        n1 = (nx + ny) / 2 + np.sqrt(((nx - ny) / 2)**2 + nxy**2)
        n2 = (nx + ny) / 2 - np.sqrt(((nx - ny) / 2)**2 + nxy**2)
        angle_m = np.degrees(np.arctan2(2 * nxy, nx - ny)) if abs(nx - ny) > 1e-12 or abs(nxy) > 1e-12 else 0
        element_membrane.append(ElementMembraneForce(
            elementId=elem_idx,
            nx=round(nx, 3), ny=round(ny, 3), nxy=round(nxy, 3),
            n1=round(n1, 3), n2=round(n2, 3), angle=round(angle_m, 2)
        ))

        # Bending moments (scale N*m/m -> kNm/m)
        mx, my, mxy = compute_element_moments(xy, u_bend, D_mat)
        mx = mx / 1000.0
        my = my / 1000.0
        mxy = mxy / 1000.0
        element_moments.append(ElementMoment(
            elementId=elem_idx,
            mx=round(mx, 6), my=round(my, 6), mxy=round(mxy, 6),
            m1=round((mx+my)/2 + np.sqrt(((mx-my)/2)**2 + mxy**2), 6),
            m2=round((mx+my)/2 - np.sqrt(((mx-my)/2)**2 + mxy**2), 6),
            angle=round(0.5 * np.degrees(np.arctan2(2*mxy, mx-my)), 2)
        ))

        # Bending stresses (in MPa using h_m in meters: 6 * M (kNm/m) / h^2 (m^2) / 1000 = MPa)
        s_mx = (6 * mx / (h_m**2) / 1000.0) if h_m > 0 else 0
        s_my = (6 * my / (h_m**2) / 1000.0) if h_m > 0 else 0
        s_mxy = (6 * mxy / (h_m**2) / 1000.0) if h_m > 0 else 0
        s1 = (6 * element_moments[-1].m1 / (h_m**2) / 1000.0) if h_m > 0 else 0
        s2 = (6 * element_moments[-1].m2 / (h_m**2) / 1000.0) if h_m > 0 else 0
        vm = np.sqrt(s1**2 + s2**2 - s1*s2)
        element_stresses.append(ElementStress(
            elementId=elem_idx,
            s1=round(s1, 3), s2=round(s2, 3), vm=round(vm, 3),
            mx=round(s_mx, 3), my=round(s_my, 3), mxy=round(s_mxy, 3)
        ))

        # Shear forces
        vx, vy = compute_element_shears(xy, u_bend, D_mat)
        v1 = np.sqrt(vx**2 + vy**2)
        s_angle = np.degrees(np.arctan2(vy, vx)) if abs(vx) > 1e-12 or abs(vy) > 1e-12 else 0
        element_shears.append(ElementShear(
            elementId=elem_idx,
            vx=round(vx, 3), vy=round(vy, 3), v1=round(v1, 3), angle=round(s_angle, 2)
        ))

        min_mx = min(min_mx, mx)
        max_mx = max(max_mx, mx)
        min_my = min(min_my, my)
        max_my = max(max_my, my)
        min_mxy = min(min_mxy, mxy)
        max_mxy = max(max_mxy, mxy)
        min_vx = min(min_vx, vx)
        max_vx = max(max_vx, vx)
        min_vy = min(min_vy, vy)
        max_vy = max(max_vy, vy)
        min_nx = min(min_nx, nx)
        max_nx = max(max_nx, nx)
        min_ny = min(min_ny, ny)
        max_ny = max(max_ny, ny)
        min_nxy = min(min_nxy, nxy)
        max_nxy = max(max_nxy, nxy)

    all_wz = [d.wz for d in node_deflections]
    min_wz = min(all_wz) if all_wz else 0.0
    max_wz = max(abs(w) for w in all_wz) if all_wz else 0.0

    return AnalysisResponse(
        success=True,
        nodeDeflections=node_deflections,
        elementMoments=element_moments,
        elementStresses=element_stresses,
        elementShears=element_shears,
        elementMembraneForces=element_membrane,
        columnPunching=column_punching,
        minWz=round(min_wz, 10),
        maxWz=round(max_wz, 10),
        minMx=round(min_mx, 6),
        maxMx=round(max_mx, 6),
        minMy=round(min_my, 6),
        maxMy=round(max_my, 6),
        minMxy=round(min_mxy, 6),
        maxMxy=round(max_mxy, 6),
        minVx=round(min_vx, 3),
        maxVx=round(max_vx, 3),
        minVy=round(min_vy, 3),
        maxVy=round(max_vy, 3),
        minNx=round(min_nx, 3),
        maxNx=round(max_nx, 3),
        minNy=round(min_ny, 3),
        maxNy=round(max_ny, 3),
        minNxy=round(min_nxy, 3),
        maxNxy=round(max_nxy, 3),
        solverTime=round(solver_time, 4),
    )
