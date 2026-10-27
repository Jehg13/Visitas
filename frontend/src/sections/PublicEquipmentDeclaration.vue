<script setup lang="ts">
import { onMounted, ref } from "vue";

type ItemType = "Equipo" | "Herramienta";
type DeclaredItem = {
  id?: number;
  itemType: ItemType;
  quantity: number;
  product: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  notes: string;
};
type PublicDeclaration = {
  id: number;
  personName: string;
  companyName: string;
  visitDate: string | null;
  visitTime: string | null;
  status: "Pendiente" | "Enviada";
  items: DeclaredItem[];
};

const token = new URLSearchParams(window.location.hash.slice(1)).get("equipo") ?? "";
const declaration = ref<PublicDeclaration | null>(null);
const items = ref<DeclaredItem[]>([]);
const newItem = ref<DeclaredItem>(emptyItem());
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const submitted = ref(false);
const confirmedReview = ref(false);
const editingItemIndex = ref<number | null>(null);

function emptyItem(): DeclaredItem {
  return {
    itemType: "Equipo",
    quantity: 1,
    product: "",
    brand: "",
    model: "",
    serialNumber: "",
    color: "",
    notes: "",
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("No se pudo conectar con el servidor de declaraciones.");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("El servidor devolvió una declaración con formato inválido.");
  }
}

onMounted(async () => {
  if (!token) {
    errorMessage.value = "El enlace de declaración no es válido.";
    loading.value = false;
    return;
  }
  try {
    const response = await fetch(`/api/equipment/public/${encodeURIComponent(token)}`);
    const result = await parseResponse<{ declaration?: PublicDeclaration; error?: string }>(response);
    if (!response.ok || !result.declaration) {
      throw new Error(result.error ?? "No se pudo abrir la declaración.");
    }
    declaration.value = result.declaration;
    submitted.value = result.declaration.status === "Enviada";
    items.value = result.declaration.items;
  } catch (error) {
    console.error("No se pudo cargar la declaración pública de equipo:", error);
    errorMessage.value = error instanceof Error ? error.message : "No se pudo abrir la declaración.";
  } finally {
    loading.value = false;
  }
});

function addItem() {
  if ((editingItemIndex.value === null && items.value.length >= 50) || !newItem.value.product.trim()) return;
  if (!Number.isSafeInteger(newItem.value.quantity) || newItem.value.quantity < 1 || newItem.value.quantity > 100000) {
    errorMessage.value = "La cantidad debe ser un número entero entre 1 y 100,000.";
    return;
  }
  const item = {
    ...newItem.value,
    product: newItem.value.product.trim(),
    brand: newItem.value.brand.trim(),
    model: newItem.value.model.trim(),
    serialNumber: newItem.value.serialNumber.trim(),
    color: newItem.value.color.trim(),
    notes: newItem.value.notes.trim(),
  };
  if (!item.brand || !item.model || !item.color) {
    errorMessage.value = "Completa tipo, cantidad, artículo, marca, modelo y color. La serie y las observaciones son opcionales.";
    return;
  }
  if (editingItemIndex.value === null) items.value.push(item);
  else items.value.splice(editingItemIndex.value, 1, item);
  newItem.value = emptyItem();
  editingItemIndex.value = null;
  errorMessage.value = "";
}

function editItem(index: number) {
  const item = items.value[index];
  if (!item) return;
  newItem.value = { ...item };
  editingItemIndex.value = index;
  errorMessage.value = "";
  document.querySelector("#equipment-item-form-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEdit() {
  newItem.value = emptyItem();
  editingItemIndex.value = null;
  errorMessage.value = "";
}

function removeItem(index: number) {
  items.value.splice(index, 1);
  if (editingItemIndex.value === index) cancelEdit();
  else if (editingItemIndex.value !== null && index < editingItemIndex.value) editingItemIndex.value -= 1;
}

async function submitDeclaration() {
  if (
    saving.value ||
    !declaration.value ||
    items.value.length === 0 ||
    !confirmedReview.value
  ) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/equipment/public/${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.value }),
    });
    const result = await parseResponse<{ message?: string; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo enviar la declaración.");
    declaration.value.items = [...items.value];
    declaration.value.status = "Enviada";
    submitted.value = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } catch (error) {
    console.error("No se pudo enviar la declaración de equipo:", error);
    errorMessage.value = error instanceof Error ? error.message : "No se pudo enviar la declaración.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="public-equipment-page">
    <section class="public-equipment-card" aria-labelledby="public-equipment-title">
      <div class="public-equipment-brand">
        <span class="public-equipment-mark" aria-hidden="true">C</span>
        <span>CyMEZ <small>CONTROL DE ACCESO</small></span>
      </div>
      <p class="public-equipment-eyebrow">DECLARACIÓN DE INGRESO</p>
      <h1 id="public-equipment-title">Equipo y herramientas</h1>

      <p v-if="loading" class="public-equipment-message" role="status">Cargando declaración…</p>
      <div v-else-if="errorMessage && !declaration" class="public-equipment-error" role="alert">{{ errorMessage }}</div>
      <template v-else-if="declaration">
        <div class="public-equipment-visitor">
          <span>Persona externa</span>
          <strong>{{ declaration.personName }}</strong>
          <span>{{ declaration.companyName }}</span>
          <span v-if="declaration.visitDate">Cita: {{ declaration.visitDate }} {{ declaration.visitTime }}</span>
        </div>

        <div v-if="submitted" class="public-equipment-success" role="status">
          <span class="public-equipment-success-icon" aria-hidden="true">✓</span>
          <h2>Declaración enviada</h2>
          <p>Este enlace ya no funciona. La recepción usará esta lista para verificar el equipo y las herramientas que ingresen y salgan.</p>
          <div class="public-equipment-submitted-table-wrap">
            <table class="public-equipment-table">
              <thead>
                <tr><th>Tipo</th><th>Cant.</th><th>Artículo</th><th>Identificación</th><th>Observaciones</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in declaration.items" :key="item.id ?? index">
                  <td>{{ item.itemType }}</td>
                  <td>{{ item.quantity }}</td>
                  <td>{{ item.product }}</td>
                  <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
                  <td>{{ item.notes || "—" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <template v-else>
          <div class="public-equipment-warning" role="note">
            <strong>Enlace de un solo uso: revisa todo antes de enviar.</strong>
            <p>Agrega cada equipo y herramienta que llevarás. En recepción solo podrá ingresar lo que aparezca en esta lista; si omites un artículo, no se permitirá su entrada. Después de enviar no podrás cambiar la declaración y este enlace quedará desactivado.</p>
          </div>

          <section class="public-equipment-entry" aria-labelledby="equipment-item-form-title">
            <h2 id="equipment-item-form-title">{{ editingItemIndex === null ? "Agregar artículo a la lista" : "Editar artículo" }}</h2>
            <p class="public-equipment-form-hint">Todos los datos son obligatorios, excepto la serie y las observaciones.</p>
            <form class="public-equipment-entry-form" @submit.prevent="addItem">
              <label>
                Tipo
                <select v-model="newItem.itemType" required :disabled="saving">
                  <option value="Equipo">Equipo</option>
                  <option value="Herramienta">Herramienta</option>
                </select>
              </label>
              <label>
                Cantidad
                <input v-model.number="newItem.quantity" type="number" min="1" max="100000" step="1" required :disabled="saving" />
              </label>
              <label class="public-entry-product">
                Artículo
                <input v-model.trim="newItem.product" maxlength="180" pattern=".*\S.*" placeholder="Ej. Laptop o taladro" required :disabled="saving" />
              </label>
              <label>
                Marca
                <input v-model.trim="newItem.brand" maxlength="120" pattern=".*\S.*" required :disabled="saving" />
              </label>
              <label>
                Modelo
                <input v-model.trim="newItem.model" maxlength="120" pattern=".*\S.*" required :disabled="saving" />
              </label>
              <label>
                Serie <span>(opcional)</span>
                <input v-model.trim="newItem.serialNumber" maxlength="180" :disabled="saving" />
              </label>
              <label>
                Color
                <input v-model.trim="newItem.color" maxlength="80" pattern=".*\S.*" required :disabled="saving" />
              </label>
              <label class="public-entry-notes">
                Observaciones
                <textarea v-model.trim="newItem.notes" maxlength="1000" rows="2" :disabled="saving" />
              </label>
              <div class="public-equipment-form-actions">
                <button
                  v-if="editingItemIndex !== null"
                  class="public-equipment-cancel-edit"
                  type="button"
                  :disabled="saving"
                  @click="cancelEdit"
                >Cancelar edición</button>
                <button
                  class="public-equipment-add-button"
                  type="submit"
                  :disabled="saving || (editingItemIndex === null && items.length >= 50)"
                >
                  {{ editingItemIndex !== null ? "Guardar cambios" : items.length >= 50 ? "Máximo de artículos alcanzado" : "+ Agregar a la lista" }}
                </button>
              </div>
              <p v-if="errorMessage" class="public-equipment-error public-equipment-form-error" role="alert">
                {{ errorMessage }}
              </p>
              <span class="sr-only" aria-live="polite">
                {{ editingItemIndex === null ? "" : `Editando artículo ${editingItemIndex + 1}` }}
              </span>
            </form>
          </section>

          <section class="public-equipment-list" aria-labelledby="equipment-list-title">
            <div class="public-equipment-list-heading">
              <h2 id="equipment-list-title">Artículos declarados</h2>
              <span>{{ items.length }} / 50</span>
            </div>
            <div v-if="items.length" class="public-equipment-table-wrap">
              <table class="public-equipment-table">
                <thead>
                  <tr><th>Tipo</th><th>Cant.</th><th>Artículo</th><th>Identificación</th><th>Observaciones</th><th><span class="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in items" :key="item.id ?? index">
                    <td>{{ item.itemType }}</td>
                    <td>{{ item.quantity }}</td>
                    <td>{{ item.product }}</td>
                    <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
                    <td>{{ item.notes || "—" }}</td>
                    <td class="public-equipment-actions-cell">
                      <button class="public-equipment-edit" type="button" :aria-label="`Editar ${item.product}`" :disabled="saving" @click="editItem(index)">Editar</button>
                      <button class="public-equipment-remove" type="button" :aria-label="`Eliminar ${item.product}`" :disabled="saving" @click="removeItem(index)">Eliminar</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="public-equipment-empty">Todavía no agregas artículos. Registra aquí todo lo que llevarás.</p>
          </section>

          <form class="public-equipment-submit-form" @submit.prevent="submitDeclaration">
            <label class="public-equipment-confirm">
              <input v-model="confirmedReview" type="checkbox" required />
              <span>Confirmo que revisé con atención la lista y que incluye todo lo que llevaré. Entiendo que lo que no esté declarado no podrá ingresar.</span>
            </label>
            <p v-if="errorMessage" class="public-equipment-error" role="alert">{{ errorMessage }}</p>
            <button class="public-equipment-submit" type="submit" :disabled="saving || !items.length || !confirmedReview">
              {{ saving ? "Enviando y cerrando enlace…" : "Enviar declaración definitiva" }}
            </button>
            <p class="public-equipment-footnote">Al enviar, los artículos se guardan en el sistema y el enlace queda inutilizable. No será posible editar ni volver a enviar esta declaración.</p>
          </form>
        </template>
      </template>
    </section>
  </main>
</template>
