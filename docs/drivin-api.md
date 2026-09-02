# Documentación API Drivin (external)

Base URL: `https://external.driv.in/api/external`

Headers comunes:
- `X-API-Key: {{api_key}}`
- `Content-Type: application/json`

---

## POST `/v2/addresses` — Crear dirección

Crea una dirección en el Maestro de Direcciones.

### Propiedades soportadas

| Campo | Tipo | Tamaño | Descripción |
|-------|------|--------|-------------|
| `code` | string | 255 | Código de la dirección (recomendado) |
| `address1` | string (**required**) | 255 | Dirección física, ej. calle y número (se usa para georreferenciar; lo más limpio posible) |
| `address2` | string | 255 | Referencia para agregar a la dirección (Oficina, Departamento, etc.) |
| `city` | string (**required**) | 255 | Comuna o Ciudad (depende del país) |
| `state` | string | 255 | Región o Estado (depende del país) |
| `county` | string | 255 | Condado o Provincia |
| `country` | string (**required**) | 255 | País de la dirección |
| `zip_code` | string | 255 | Código Postal |
| `lat` | number | | Latitud (≤ 90) |
| `lng` | number | | Longitud (≤ 180) |
| `name` | string | 255 | Nombre de la dirección |
| `dispatch_date` | string | 255 | Fecha de despacho |
| `client` | string | 255 | Nombre del cliente |
| `client_code` | string | 255 | Código del cliente |
| `address_type` | string | 255 | Segmenta clientes para reportes |
| `contact_name` | string | 255 | Nombre de la persona de contacto |
| `phone` | string | 255 | Teléfono de contacto |
| `email` | string | 255 | Correo de contacto |
| `approve_contact_name` / `approve_contact_phone` / `approve_contact_email` | string | 255 | Contacto a notificar al **aprobar** la ruta |
| `start_contact_name` / `start_contact_phone` / `start_contact_email` | string | 255 | Contacto a notificar al **iniciar** la ruta |
| `near_contact_name` / `near_contact_phone` / `near_contact_email` | string | 255 | Contacto a notificar cuando el vehículo **esté por arribar** |
| `delivered_contact_name` / `delivered_contact_phone` / `delivered_contact_email` | string | 255 | Contacto a notificar al **finalizar** la entrega/retiro |
| `service_time` | number | 11 | Tiempo que demora la entrega/retiro en esta dirección |
| `time_window_start` / `time_window_end` | string | | Primera ventana horaria "hh:mm" |
| `time_window_start_2` / `time_window_end_2` | string | | Segunda ventana horaria "hh:mm" |
| `vehicle_code` | string | 255 | Código del vehículo |
| `exclusive` | string | 255 | Exclusividad de la dirección |
| `observation` | string | 255 | Comentario de la dirección |
| `update_all` | boolean | | Actualizar total o parcialmente |
| `sales_zone_code` / `sales_zone_name` | string | 255 | Zona de venta |
| `supplier_code` / `supplier_name` | string | 255 | Proveedor |
| `employer_code` / `employer_name` | string | 255 | Empleador (debe existir en socios de negocios para hacer match) |
| `priority` | number | | Prioridad de planificación (1 > 2 > 3) |
| `sequence_priority` | number | | Orden/secuencia al planificar |
| `stops_known_threshold` | number | | Umbral de parada conocido (metros) |
| `additional_contacts[]` | json | | Contactos adicionales (`.email`, `.name`, `.phone`) |
| `tags[]` | json | | Arreglo de características |
| `search_tags[]` | json | | Arreglo de características de búsqueda |

### Body de ejemplo

```json
{
    "addresses": [
        {
            "code": "21839794-000",
            "address1": "Escriva de Balaguer 770",
            "address2": "Departamento 1605",
            "city": "Concon",
            "state": "Valparaiso",
            "county": null,
            "country": "Chile",
            "zip_code": null,
            "lat": -32.9501572,
            "lng": -71.5397649,
            "name": "MARIA ISABEL TORO ROJAS",
            "client": "EMPRESA EMBOTELLADORA DE AGUA",
            "client_code": null,
            "address_type": "Departamento",
            "contact_name": "MARIA ISABEL TORO ROJAS",
            "phone": null,
            "email": null,
            "approve_contact_name": "ALEXANDRA ARAUJO",
            "approve_contact_email": "alexandra.araujo@driv.in",
            "start_contact_name": "ALEXANDRA ARAUJO",
            "start_contact_email": "alexandra.araujo@driv.in",
            "near_contact_name": "ALEXANDRA ARAUJO",
            "near_contact_email": "alexandra.araujo@driv.in",
            "delivered_contact_name": "ALEXANDRA ARAUJO",
            "delivered_contact_email": "alexandra.araujo@driv.in",
            "service_time": 10,
            "time_window_start": "07:00",
            "time_window_end": "18:00",
            "time_window_start_2": "19:00",
            "time_window_end_2": "21:00",
            "update_all": true,
            "additional_contacts": [
                { "email": null, "phone": null, "name": null }
            ]
        }
    ]
}
```

### Respuesta `200 OK`

```json
{ "success": true, "status": "OK", "response": 1 }
```

---

## POST `/v2/multipleleg` — Crear múltiples escenarios (órdenes con tramos)

Crea un escenario cuyas órdenes tienen múltiples tramos (legs).

### Parámetros

| Campo | Tipo | Tamaño | Descripción |
|-------|------|--------|-------------|
| `clients[]` | json (**required**) | | Clientes a visitar |
| `clients[].code` | string | 255 | Código que identifica dirección o cliente |
| `clients[].address` | string (**required**) | 255 | Dirección (no requerido si el `code` ya existe en el maestro) |
| `clients[].reference` | string | 255 | Referencia de la dirección |
| `clients[].city` | string | 255 | Comuna o Ciudad |
| `clients[].county` | string | 255 | Región o Provincia |
| `clients[].country` | string (**required**) | 255 | País (no requerido si `code` ya existe) |
| `clients[].lat` / `.lng` | number | 12,9 | Coordenadas |
| `clients[].postal_code` | string | 255 | Código postal |
| `clients[].name` | string | 255 | Nombre de la dirección |
| `clients[].client_name` / `.client_code` | string | 255 | Cliente |
| `clients[].address_type` | string | 255 | Tipo de dirección |
| **Órdenes** | | | |
| `orders[].code` | string (**required**) | 255 | Código de la orden |
| `orders[].alt_code` | string | 255 | Código alternativo de la orden |
| `orders[].description` | string | 255 | Descripción de la orden |
| `orders[].units_1` / `.units_2` / `.units_3` | number | | Unidades de medida |
| `orders[].position` | number | | Posición de entrega |
| `orders[].vehicle_code` | string | 255 | Vehículo asignado |
| `orders[].delivery_date` | string | 255 | Fecha máxima de entrega |
| `orders[].billing_date` | string | 255 | Fecha de facturación |
| `orders[].order_type` | string | 255 | Tipo de orden |
| `orders[].custom_1..custom_11` | string | 255 | Info adicional |
| `orders[].number_1` | number | | Info adicional numérica |
| **Items** | | | |
| `items[].code` | string | 255 | Código de item (SKU) |
| `items[].description` | string | 255 | Descripción del item |
| `items[].units` | number | 11 | Cantidad de unidades |
| `items[].units_1..units_3` | number | 30,12 | Unidades de medida (prioridad sobre las de la orden) |
| **Legs (tramos)** | | | |
| `legs[].schema_name` | string (**required**) | 255 | Esquema asociado al tramo (define el origen) |
| `legs[].address_code` | string (**required**) | 255 | Código de dirección destino del tramo (debe existir en maestro de clientes) |
| `legs[].departure_date` | string | 255 | Fecha de salida (requerido solo si es el primer tramo) |
| `legs[].service_time` | number | 11 | Tiempo de servicio |
| `legs[].vehicle_code` | string | 255 | Vehículo asignado |
| `legs[].position` | number | 11 | Posición dentro de la ruta |
| `legs[].priority` | number | 11 | Prioridad de planificación por falta de vehículos |
| `legs[].delivery_priority` | number | 11 | Prioridad de entrega dentro de la ruta |
| `legs[].contact_name/phone/email` | string | 255 | Contacto |
| `legs[].approve_contact_*` | string | 255 | Contacto al aprobar la ruta |
| `legs[].start_contact_*` | string | 255 | Contacto al iniciar la ruta |
| `legs[].near_contact_*` | string | 255 | Contacto cuando esté por arribar |
| `legs[].delivered_contact_*` | string | 255 | Contacto al finalizar |
| `legs[].tags[]` | json | | Características que debe cumplir el vehículo |
| `legs[].time_windows[]` | json | | Ventanas horarias (`.start`, `.end` en "hh:mm") |

### Body de ejemplo (estructura)

```json
{
  "clients": [
    {
      "code": "IQU001",
      "orders": [
        {
          "code": "O_IQU001",
          "units_1": 1,
          "delivery_date": "2018-06-10",
          "items": [
            { "code": "item_code", "description": "item_description", "units": 1, "units_1": 0.5 },
            { "code": "item_code_2", "description": "item_description_2", "units": 1, "units_1": 0.5 }
          ],
          "legs": [
            { "schema_name": "MULTIPLES DIAS", "address_code": "D002", "departure_date": "2018-06-05", "service_time": 100 },
            { "schema_name": "Iquique", "address_code": "IQU001" }
          ]
        }
      ]
    }
  ]
}
```

### Respuesta `200 OK`

```json
{
  "success": true,
  "status": "OK",
  "response": [
    {
      "scenario_token": "scenario_token",
      "addresses_count": 5,
      "orders_count": 40,
      "items_count": 80,
      "vehicles_count": 10
    }
  ]
}
```

---

## GET `/v2/scenarios/{scenario_token}/status` — Status de un escenario

Obtiene el estado de un escenario. El `scenario_token` se consulta en *Escenarios de una fecha*.

### Respuesta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Estado del escenario |
| `token` | string | Token del escenario |
| `deploy_date` | string | Fecha en que se creó el plan |
| `description` | string | Descripción del escenario |
| `schema_name` | string | Nombre del esquema asociado |

### Estados posibles

| Estado | Definición |
|--------|------------|
| `Geocoding` | Localizando las direcciones |
| `Incomplete` | Faltan datos para optimizar |
| `Ready` | Listo para optimizar |
| `Queueing` | En espera de optimización |
| `Optimizing` | Optimizando |
| `Canceled` | Optimización cancelada |
| `Error` | Error en la optimización |
| `Infeasible` | No es posible encontrar solución |
| `Optimized` | Optimizado |
| `Modified` | Modificado desde el editor |
| `Approved` | Optimización aprobada |
| `Reoptimizing` | Reoptimizando |
| `Started` | Se inició alguna ruta del escenario |
| `Uploading` | En espera de creación (se enviaron múltiples planes) |

### Ejemplo de respuesta `200 OK`

```json
{
  "success": true,
  "status": "OK",
  "response": {
    "status": "Approved",
    "token": "scenario_token",
    "deploy_date": "2023-02-04",
    "description": "Prueba de dias",
    "schema_name": "MD"
  }
}
```

---

## PUT `/v2/scenarios/{scenario_token}/unapproved` — Desaprobar un escenario

Desaprueba todas las rutas de un escenario.

### Ejemplo

```bash
curl --location --request PUT \
  'https://external.driv.in/api/external/v2/scenarios/eb52c49d-7cc5-4f55-a865-619cd2652abe/unapproved' \
  --header 'X-API-Key: {{api_key}}'
```

### Respuesta `200 OK`

```json
{
  "success": true,
  "status": "OK",
  "response": { "scenario_token": "scenario_token" }
}
```
