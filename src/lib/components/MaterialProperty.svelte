<script lang="ts">
  import { model } from '../stores/structuralModel.svelte';

  const concreteGrades = [
    { value: 'M20', label: 'M20 (fck=20 MPa)' },
    { value: 'M25', label: 'M25 (fck=25 MPa)' },
    { value: 'M30', label: 'M30 (fck=30 MPa)' },
    { value: 'M35', label: 'M35 (fck=35 MPa)' },
    { value: 'M40', label: 'M40 (fck=40 MPa)' },
    { value: 'M45', label: 'M45 (fck=45 MPa)' },
    { value: 'M50', label: 'M50 (fck=50 MPa)' },
    { value: 'M55', label: 'M55 (fck=55 MPa)' },
    { value: 'M60', label: 'M60 (fck=60 MPa)' },
  ];

  const rebarGrades = [
    { value: 'Fe250', label: 'Fe250 (fy=250 MPa)' },
    { value: 'Fe415', label: 'Fe415 (fy=415 MPa)' },
    { value: 'Fe500', label: 'Fe500 (fy=500 MPa)' },
    { value: 'Fe550', label: 'Fe550 (fy=550 MPa)' },
    { value: 'Fe600', label: 'Fe600 (fy=600 MPa)' },
  ];
</script>

<div class="sidebar-panel flex flex-col gap-3 rounded-lg bg-[#1a1a1a] p-3 border border-[#333333]">
  <div class="text-xs font-bold text-[#ffffff] uppercase tracking-wider">Material Property</div>

  <div class="flex flex-col gap-1">
    <label class="text-xs text-[#ffffff] font-medium">Concrete Grade</label>
    <select
      bind:value={model.concreteGrade}
      class="rounded bg-[#333333] px-2 py-1.5 text-xs text-white border border-[#444444]"
    >
      {#each concreteGrades as g}
        <option value={g.value}>{g.label}</option>
      {/each}
    </select>
  </div>

  <div class="flex flex-col gap-1">
    <label class="text-xs text-[#ffffff] font-medium">Rebar Grade</label>
    <select
      bind:value={model.rebarGrade}
      class="rounded bg-[#333333] px-2 py-1.5 text-xs text-white border border-[#444444]"
    >
      {#each rebarGrades as g}
        <option value={g.value}>{g.label}</option>
      {/each}
    </select>
  </div>
</div>