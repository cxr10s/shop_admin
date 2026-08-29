async function generarFacturaPDF(pedido) {
    try {
        // ==============================
        // VALIDACIONES
        // ==============================
        if (!pedido) {
            throw new Error('Pedido inválido');
        }

        // ==============================
        // CARGAR JSPDF (Optimizado)
        // ==============================
        if (!window.jspdf?.jsPDF) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
                document.head.appendChild(script);
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        if (!doc.roundedRect && doc.roundRect) {
            doc.roundedRect = doc.roundRect;
        }

        // ==============================
        // DATOS (campos reales de Supabase, igual que mispedidos.html)
        // ==============================
        const id        = String(pedido.id || 'LOCAL').substring(0, 8).toUpperCase();
        const productos = Array.isArray(pedido.productos) ? pedido.productos : [];

        // Fecha y hora REALES del pedido desde created_at de Supabase
        const fechaCompra = pedido.created_at ? new Date(pedido.created_at) : new Date();
        const FECHA = fechaCompra.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
        const HORA  = fechaCompra.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

        // Tipo de entrega: 'domicilio' | 'tienda'  (igual que mispedidos.html)
        const esDomicilio = String(pedido.tipo_entrega || '').toLowerCase() === 'domicilio';

        // Dirección: direccion_envio primero, luego direccion (mismo fallback que mispedidos.html línea 932)
        const direccion = pedido.direccion_envio || pedido.direccion || 'No especificada';

        // Valores financieros directamente desde los campos guardados en Supabase:
        //   pedido.envio      → costo de envío real (0 = gratis, 25000 = con costo)
        //   pedido.descuento  → descuento en pesos calculado al momento de compra
        //   pedido.total      → total final ya pagado
        const descuento  = Number(pedido.descuento || 0);
        const costoEnvio = Number(pedido.envio     || 0);
        const total      = Number(pedido.total      || 0);

        // Método de pago (cualquier banco/medio, no solo Nequi) y estado del pedido
        const metodoPagoRaw = String(pedido.metodo_pago || '').trim();
        const metodoPago = metodoPagoRaw
            ? metodoPagoRaw.charAt(0).toUpperCase() + metodoPagoRaw.slice(1)
            : 'No especificado';
        const estadoPedido = String(pedido.estado || 'pendiente').toLowerCase();

        // ==============================
        // COLORES
        // ==============================
        const C = {
            dark:   [13, 17, 23],
            accent: [173, 255, 47],
            text:   [40, 40, 40],
            muted:  [120, 120, 120],
            bg:     [248, 249, 252],
            zebra:  [250, 250, 252],
            line:   [230, 230, 230]
        };

        const ESTADO_STYLE = {
            pendiente:  { label: 'PENDIENTE',  color: [245, 158, 11] },
            pagado:     { label: 'PAGADO',     color: [34, 197, 94]  },
            enviado:    { label: 'ENVIADO',    color: [59, 130, 246] },
            entregado:  { label: 'ENTREGADO',  color: [16, 163, 127] },
            cancelado:  { label: 'CANCELADO',  color: [239, 68, 68]  }
        };
        const estadoStyle = ESTADO_STYLE[estadoPedido] || ESTADO_STYLE.pendiente;

        // ==============================
        // CONSTANTES DE LAYOUT
        // ==============================
        const PAGE_W       = 210;
        const MARGIN_X     = 20;
        const CONTENT_R    = 190;
        const HEADER_H     = 55;
        const FOOTER_SAFE  = 292; // límite antes del pie / borde de página
        const COL_DESC_X   = 25;
        const COL_DESC_W   = 68;   // ancho útil para el nombre del producto (con salto de línea)
        const COL_CANT_X   = 100;
        const COL_PRECIO_X = 148;  // right-aligned
        const COL_TOTAL_X  = 185;  // right-aligned
        const ROW_LINE_H   = 4.6;
        const ROW_PAD      = 5.5;

        let pageNum = 1;

        // ==============================
        // LOGO GITHUB (base64, se genera una sola vez)
        // ==============================
        const githubLogoB64 = await (async () => {
            const svgStr = `<svg width="60" height="60" viewBox="0 0 73 73" xmlns="http://www.w3.org/2000/svg"><g transform="translate(2,2)"><path d="M58.3067362,21.4281798 C55.895743,17.2972267 52.6253846,14.0267453 48.4948004,11.615998 C44.3636013,9.20512774 39.8535636,8 34.9614901,8 C30.0700314,8 25.5585181,9.20549662 21.4281798,11.615998 C17.2972267,14.0266224 14.0269912,17.2972267 11.615998,21.4281798 C9.20537366,25.5590099 8,30.0699084 8,34.9607523 C8,40.8357654 9.71405782,46.1187277 13.1430342,50.8109917 C16.5716416,55.5036246 21.0008949,58.7507436 26.4304251,60.5527176 C27.0624378,60.6700211 27.5302994,60.5875152 27.8345016,60.3072901 C28.1388268,60.0266961 28.290805,59.6752774 28.290805,59.2545094 C28.290805,59.1842994 28.2847799,58.5526556 28.2730988,57.3588401 C28.2610487,56.1650247 28.2553926,55.1235563 28.2553926,54.2349267 L27.4479164,54.3746089 C26.9330843,54.468919 26.2836113,54.5088809 25.4994975,54.4975686 C24.7157525,54.4866252 23.9021284,54.4044881 23.0597317,54.2517722 C22.2169661,54.1004088 21.4330982,53.749359 20.7075131,53.1993604 C19.982297,52.6493618 19.4674649,51.9294329 19.1631397,51.0406804 L18.8120898,50.2328353 C18.5780976,49.6950097 18.2097104,49.0975487 17.7064365,48.4426655 C17.2031625,47.7871675 16.6942324,47.3427912 16.1794003,47.108799 L15.9336039,46.9328437 C15.7698216,46.815909 15.6178435,46.6748743 15.4773006,46.511215 C15.3368806,46.3475556 15.2317501,46.1837734 15.1615401,46.0197452 C15.0912072,45.855594 15.1494901,45.7209532 15.3370036,45.6153308 C15.5245171,45.5097084 15.8633939,45.4584343 16.3551097,45.4584343 L17.0569635,45.5633189 C17.5250709,45.6571371 18.104088,45.9373622 18.7947525,46.4057156 C19.4850481,46.8737001 20.052507,47.4821045 20.4972521,48.230683 C21.0358155,49.1905062 21.6846737,49.9218703 22.4456711,50.4251443 C23.2060537,50.9284182 23.9727072,51.1796248 24.744894,51.1796248 C25.5170807,51.1796248 26.1840139,51.121096 26.7459396,51.0046532 C27.3072505,50.8875956 27.8338868,50.7116403 28.3256025,50.477771 C28.5362325,48.9090515 29.1097164,47.7039238 30.0455624,46.8615271 C28.7116959,46.721353 27.5124702,46.5102313 26.4472706,46.2295144 C25.3826858,45.9484285 24.2825656,45.4922482 23.1476478,44.8597436 C22.0121153,44.2280998 21.0701212,43.44374 20.3214198,42.5080169 C19.5725954,41.571802 18.9580429,40.3426971 18.4786232,38.821809 C17.9989575,37.300306 17.7590632,35.5451796 17.7590632,33.5559381 C17.7590632,30.7235621 18.6837199,28.3133066 20.5326645,26.3238191 C19.6665366,24.1944035 19.7483048,21.8072644 20.778215,19.1626478 C21.4569523,18.951772 22.4635002,19.1100211 23.7973667,19.6364115 C25.1314792,20.1630477 26.1082708,20.6141868 26.7287253,20.9882301 C27.3491798,21.3621504 27.8463057,21.6790175 28.2208409,21.9360032 C30.3978419,21.3277217 32.644438,21.0235195 34.9612442,21.0235195 C37.2780503,21.0235195 39.5251383,21.3277217 41.7022622,21.9360032 L43.0362517,21.0938524 C43.9484895,20.5319267 45.0257392,20.0169716 46.2654186,19.5488642 C47.5058357,19.0810026 48.4543466,18.9521409 49.1099676,19.1630167 C50.1627483,21.8077563 50.2565666,24.1947724 49.3901927,26.324188 C51.2390143,28.3136755 52.1640399,30.7245457 52.1640399,33.556307 C52.1640399,35.5455485 51.9232849,37.3062081 51.444357,38.8393922 C50.9648143,40.3728223 50.3449746,41.6006975 49.5845919,42.5256002 C48.8233486,43.4503799 47.8753296,44.2285916 46.7404118,44.8601125 C45.6052481,45.4921252 44.504759,45.9483056 43.4401742,46.2293914 C42.3750975,46.5104772 41.1758719,46.7217219 39.8420054,46.8621419 C41.0585683,47.9149226 41.6669728,49.5767225 41.6669728,51.846804 L41.6669728,59.2535257 C41.6669728,59.6742937 41.8132948,60.0255895 42.1061847,60.3063064 C42.3987058,60.5865315 42.8606653,60.6690374 43.492678,60.5516109 C48.922946,58.7498829 53.3521992,55.5026409 56.7806837,50.810008 C60.2087994,46.117744 61.923472,40.8347817 61.923472,34.9597686 C61.9222424,30.0695396 60.7162539,25.5590099 58.3067362,21.4281798 Z" fill="#FFFFFF"/></g></svg>`;
            return new Promise(res => {
                const img  = new Image();
                const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                const url  = URL.createObjectURL(blob);
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = 60; c.height = 60;
                    c.getContext('2d').drawImage(img, 0, 0, 60, 60);
                    URL.revokeObjectURL(url);
                    res(c.toDataURL('image/png').split(',')[1]);
                };
                img.src = url;
            });
        })();

        // ==============================
        // HEADER (se repite en cada página)
        // ==============================
        function drawHeader(continuacion) {
            doc.setFillColor(...C.dark);
            doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

            doc.addImage(githubLogoB64, 'PNG', 20, 16, 12, 12);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(26);
            doc.text('Shop', 35, 26.5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(200, 200, 205);
            doc.text('FACTURA DE VENTA ELECTRÓNICA', 35, 33);

            doc.setFillColor(...C.accent);
            doc.roundedRect(138, 15, 52, 25, 3, 3, 'F');
            doc.setTextColor(...C.dark);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('FACTURA N°', 164, 24, { align: 'center' });
            doc.setFontSize(14);
            doc.text(`#${id}`, 164, 32.5, { align: 'center' });

            // Badge de estado, debajo de la caja de la factura
            doc.setFillColor(...estadoStyle.color);
            doc.roundedRect(138, 42.5, 52, 8, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(estadoStyle.label, 164, 47.8, { align: 'center' });

            if (continuacion) {
                doc.setTextColor(200, 200, 205);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8.5);
                doc.text('(continuación)', 35, 40);
            }
        }

        // ==============================
        // PIE DE PÁGINA (números + info legal, en todas las páginas)
        // ==============================
        function drawFooterMeta(current, totalPages) {
            doc.setTextColor(...C.muted);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.text(`Página ${current} de ${totalPages}`, CONTENT_R, 292, { align: 'right' });
        }

        // ==============================
        // COMIENZO — HEADER + CLIENTE + DETALLES
        // ==============================
        drawHeader(false);

        doc.setTextColor(...C.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('CLIENTE', 20, 68);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(String(pedido.nombre || 'Consumidor Final'), 20, 76);

        doc.setFontSize(9);
        doc.setTextColor(...C.muted);
        doc.text(`Documento: ${pedido.documento || 'N/A'}`, 20, 82.5);
        doc.text(`Teléfono: ${pedido.telefono || '—'}`, 20, 87.5);

        if (esDomicilio) {
            const dirTexto = String(direccion).substring(0, 58);
            doc.text(`Dirección: ${dirTexto}`, 20, 92.5);
        } else {
            doc.setFont('helvetica', 'italic');
            doc.text('Recogida en tienda — su paquete estará listo cuando', 20, 92.5);
            doc.text('reciba la notificación de disponibilidad.', 20, 97.2);
            doc.setFont('helvetica', 'normal');
        }

        doc.setTextColor(...C.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('DETALLES', 138, 68);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.muted);
        doc.text(`Fecha: ${FECHA}`, 138, 76);
        doc.text(`Hora: ${HORA}`, 138, 81);
        doc.text(`Entrega: ${esDomicilio ? 'Domicilio' : 'Recogida en tienda'}`, 138, 86);
        doc.setTextColor(...C.text);
        doc.setFont('helvetica', 'bold');
        doc.text(`Pago: ${metodoPago}`, 138, 91.5);

        // ==============================
        // TABLA DE PRODUCTOS (con paginación y salto de línea)
        // ==============================
        let y = 112;

        function drawTableHeader() {
            doc.setFillColor(...C.bg);
            doc.rect(20, y - 6.5, 170, 9.5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...C.dark);
            doc.text('DESCRIPCIÓN', COL_DESC_X, y);
            doc.text('CANT', COL_CANT_X, y);
            doc.text('PRECIO UNIT.', COL_PRECIO_X, y, { align: 'right' });
            doc.text('TOTAL', COL_TOTAL_X, y, { align: 'right' });
            doc.setDrawColor(...C.line);
            doc.line(20, y + 4, 190, y + 4);
            y += 12;
        }

        drawTableHeader();

        productos.forEach((p, idx) => {
            const nameLines  = doc.splitTextToSize(String(p.name || 'Producto'), COL_DESC_W);
            const rowHeight  = Math.max(ROW_LINE_H + ROW_PAD, nameLines.length * ROW_LINE_H + ROW_PAD);

            // Salto de página si no cabe la fila
            if (y + rowHeight > FOOTER_SAFE - 15) {
                doc.addPage();
                pageNum++;
                drawHeader(true);
                y = 66;
                drawTableHeader();
            }

            // Zebra stripe
            if (idx % 2 === 0) {
                doc.setFillColor(...C.zebra);
                doc.rect(20, y - 4.6, 170, rowHeight, 'F');
            }

            const unitPrice  = Number(p.price || 0);
            const lineTotal  = p.isGift ? 0 : unitPrice * Number(p.quantity || 0);
            const textY      = y;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(...C.text);
            doc.text(nameLines, COL_DESC_X, textY);
            doc.text(String(p.quantity || 1), COL_CANT_X, textY);
            doc.text(`$${unitPrice.toLocaleString('es-CO')}`, COL_PRECIO_X, textY, { align: 'right' });

            if (p.isGift) {
                doc.setTextColor(34, 197, 94);
                doc.setFont('helvetica', 'bold');
                doc.text('GRATIS', COL_TOTAL_X, textY, { align: 'right' });
            } else {
                doc.setTextColor(...C.text);
                doc.text(`$${lineTotal.toLocaleString('es-CO')}`, COL_TOTAL_X, textY, { align: 'right' });
            }

            y += rowHeight;
            doc.setDrawColor(...C.line);
            doc.line(20, y - 4.6, 190, y - 4.6);
        });

        // ── Fila de envío: solo si es domicilio ──
        if (esDomicilio) {
            if (y + 10 > FOOTER_SAFE - 15) { doc.addPage(); pageNum++; drawHeader(true); y = 66; drawTableHeader(); }
            doc.setFont('helvetica', costoEnvio > 0 ? 'normal' : 'italic');
            doc.setTextColor(costoEnvio > 0 ? C.text[0] : C.muted[0], costoEnvio > 0 ? C.text[1] : C.muted[1], costoEnvio > 0 ? C.text[2] : C.muted[2]);
            doc.text(costoEnvio > 0 ? 'Costo de envío' : 'Envío a domicilio', COL_DESC_X, y);
            doc.text(costoEnvio > 0 ? `$${costoEnvio.toLocaleString('es-CO')}` : 'GRATIS', COL_TOTAL_X, y, { align: 'right' });
            y += 10;
            doc.setDrawColor(...C.line);
            doc.line(20, y - 4.6, 190, y - 4.6);
        }

        // ── Fila de descuento ──
        if (descuento > 0) {
            if (y + 10 > FOOTER_SAFE - 15) { doc.addPage(); pageNum++; drawHeader(true); y = 66; drawTableHeader(); }
            doc.setTextColor(220, 50, 50);
            doc.setFont('helvetica', 'bold');
            doc.text('Descuento aplicado', COL_DESC_X, y);
            doc.text(`-$${descuento.toLocaleString('es-CO')}`, COL_TOTAL_X, y, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...C.text);
            y += 10;
            doc.setDrawColor(...C.line);
            doc.line(20, y - 4.6, 190, y - 4.6);
        }

        // ── TOTAL ──
        if (y + 20 > FOOTER_SAFE - 15) { doc.addPage(); pageNum++; drawHeader(true); y = 66; }
        y += 6;
        doc.setFillColor(...C.dark);
        doc.roundedRect(128, y, 62, 16, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('TOTAL PAGADO', 134, y + 6.5);
        doc.setTextColor(...C.accent);
        doc.setFontSize(14);
        doc.text(`$${total.toLocaleString('es-CO')}`, 185, y + 12.5, { align: 'right' });

        // ==============================
        // PIE DE PÁGINA FINAL (en la última página)
        // ==============================
        doc.setDrawColor(...C.line);
        doc.line(20, 262, 190, 262);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.text);
        doc.text('SHOP S.A.S', 105, 268, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.muted);
        doc.setFontSize(7.5);
        doc.text('Centro, Bucaramanga · NIT #', 105, 273, { align: 'center' });
        doc.text('Soporte y devoluciones: WhatsApp +57 311 603 9256', 105, 278, { align: 'center' });
        doc.text('Tienes 5 días hábiles desde la entrega para reportar cualquier novedad con tu pedido.', 105, 283, { align: 'center' });
        doc.setFont('helvetica', 'italic');
        doc.text('Este documento es una representación gráfica de su pedido.', 105, 288, { align: 'center' });

        // Números de página en todas las hojas
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            drawFooterMeta(i, totalPages);
        }

        doc.save(`Factura-${id}.pdf`);

    } catch (err) {
        console.error(err);
        alert('Hubo un problema al generar el PDF: ' + err.message);
    }
} 
