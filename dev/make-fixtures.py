"""Creates sample Graph API data and placeholder photos for local testing.

Usage: python3 dev/make-fixtures.py dev/fixtures
The data is invented and labeled as an example; it is never published.
"""
import json, os, random, sys
from datetime import datetime, timedelta, timezone
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out = sys.argv[1] if len(sys.argv) > 1 else 'dev/fixtures'
os.makedirs(os.path.join(out, 'img'), exist_ok=True)
random.seed(7)

PALETTES = [
    ((120, 170, 220), (210, 190, 150)), ((250, 180, 120), (90, 110, 80)), ((90, 120, 160), (60, 60, 70)),
    ((200, 220, 235), (150, 140, 120)), ((240, 150, 110), (120, 80, 70)), ((170, 200, 170), (70, 100, 60)),
]

def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def photo(name, w, h, seed):
    rnd = random.Random(seed)
    sky, ground = rnd.choice(PALETTES)
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    horizon = int(h * rnd.uniform(.45, .65))
    for y in range(h):
        if y < horizon:
            t = y / horizon
            c = tuple(int(sky[i] * (1 - t * .35) + 255 * t * .15) for i in range(3))
        else:
            t = (y - horizon) / (h - horizon)
            c = tuple(int(ground[i] * (1 - t * .45)) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    for _ in range(rnd.randint(4, 9)):
        bw = rnd.randint(w // 12, w // 4); bh = rnd.randint(h // 8, h // 2)
        x = rnd.randint(-bw // 2, w); col = tuple(rnd.randint(40, 230) for _ in range(3))
        d.rectangle([x, horizon - bh, x + bw, horizon + rnd.randint(0, 20)], fill=col)
        for wy in range(horizon - bh + 12, horizon - 10, 26):
            for wx in range(x + 8, x + bw - 14, 22):
                d.rectangle([wx, wy, wx + 9, wy + 12], fill=tuple(min(255, v + 50) for v in col))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img)
    f = font(max(14, w // 40))
    d.rectangle([0, h - w // 22 - 10, w, h], fill=(0, 0, 0))
    d.text((12, h - w // 22 - 6), 'FOTO DE EJEMPLO', font=f, fill=(255, 255, 255))
    img.save(os.path.join(out, 'img', name), quality=88)

HEADLINES = [
    ('🚨 #ÚltimaHora 🚨', 'Cierran la carretera Apatzingán–Cuatro Caminos por accidente entre dos camiones de carga', 'Elementos de Protección Civil y Guardia Nacional trabajan en el lugar. Se recomienda tomar vías alternas mientras se retiran las unidades.\n\nTe mantendremos informado.'),
    (None, 'Ayuntamiento anuncia rehabilitación de la calle Constitución a partir del lunes', 'Los trabajos durarán aproximadamente tres semanas e incluyen cambio de drenaje y pavimentación con concreto hidráulico.\n\nEl tránsito será desviado por las calles aledañas.'),
    ('#Deportes', 'Los Halcones de Apatzingán ganan la final regional de la liga juvenil', 'Con un marcador de 3 a 1, el equipo local se coronó campeón ante una tribuna llena en la Unidad Deportiva.\n\n¡Felicidades a los jugadores y al cuerpo técnico! 🏆⚽'),
    (None, 'Suspenden el servicio de agua potable en la colonia Centro este jueves', 'El Organismo Operador informó que el corte será de 8:00 a 18:00 horas por trabajos de mantenimiento en la red principal. Se pide a la población almacenar agua.'),
    ('📢 AVISO', 'Inicia la campaña de vacunación para mascotas en los módulos del DIF municipal', 'La vacuna antirrábica es gratuita. Lleva a tu perro o gato con correa o en transportadora. Horario de 9:00 a 14:00 horas.'),
    (None, 'Productores de limón reportan baja en el precio por kilo en la empacadora', 'Comerciantes señalan que la sobreoferta de las últimas semanas ha provocado que el precio caiga. Esperan una recuperación a finales de mes.'),
    (None, 'Realizan con éxito el festival cultural en la plaza principal', 'Grupos de danza, música de banda y puestos de comida típica reunieron a cientos de familias durante el fin de semana.'),
    ('#Clima', 'Se esperan temperaturas de hasta 38 grados este fin de semana en Tierra Caliente', 'Protección Civil recomienda mantenerse hidratado, evitar la exposición al sol entre las 12:00 y las 16:00 horas y no dejar a niños ni mascotas dentro de vehículos.'),
    (None, 'ESTUDIANTES DEL CBTA RECIBEN RECONOCIMIENTO ESTATAL POR PROYECTO DE RIEGO SUSTENTABLE', 'El proyecto propone un sistema de riego por goteo de bajo costo para pequeños productores de la región.'),
    (None, 'Comerciantes del mercado municipal piden mejorar el alumbrado público en los pasillos exteriores; aseguran que desde hace meses las lámparas no funcionan y que por las noches la zona queda prácticamente a oscuras lo que pone en riesgo a clientes y trabajadores', None),
    (None, 'Abren convocatoria para becas municipales de transporte escolar', 'Los requisitos están disponibles en la página del Ayuntamiento: https://example.com/becas-transporte-2026\n\nLa fecha límite de registro es el 30 de noviembre.'),
    (None, 'Bomberos atienden incendio de pastizal cerca de la salida a Uruapan', 'No se reportan personas lesionadas. El fuego fue controlado después de dos horas de trabajo.'),
]

posts = []
now = datetime.now(timezone.utc).replace(microsecond=0)
page_id = '100064000000001'
for i in range(46):
    created = now - timedelta(hours=i * 19 + random.randint(0, 5), minutes=random.randint(0, 59))
    kick, head, body = HEADLINES[i % len(HEADLINES)]
    if i >= len(HEADLINES):
        head = head + f' (ejemplo {i})'
    msg = '\n'.join(x for x in [kick, head, '', body] if x is not None).strip()
    pid = f'{page_id}_{900000 + i}'
    post = {
        'id': pid,
        'message': msg,
        'created_time': created.strftime('%Y-%m-%dT%H:%M:%S+0000'),
        'permalink_url': f'https://www.facebook.com/DialogoMex/posts/{900000 + i}',
        'status_type': 'added_photos',
        'shares': {'count': random.randint(0, 60)},
        'reactions': {'data': [], 'summary': {'total_count': random.randint(5, 900)}},
        'comments': {'data': [], 'summary': {'total_count': random.randint(0, 200)}},
    }
    kind = ['photo', 'photo', 'album', 'video', 'photo', 'text', 'photo', 'link', 'photo', 'photo', 'photo', 'photo'][i % 12]
    if i == 3: kind = 'video_vertical'
    if kind == 'photo':
        name = f'p{i}.jpg'; photo(name, 720, 540, i); photo(f'p{i}-hi.jpg', 1440, 1080, i)
        post['full_picture'] = f'MOCK/img/{name}'
        post['attachments'] = {'data': [{'media_type': 'photo', 'type': 'photo', 'url': post['permalink_url'],
            'media': {'image': {'src': f'MOCK/img/{name}', 'width': 720, 'height': 540}}, 'target': {'id': f'ph{i}', 'url': post['permalink_url']}}]}
    elif kind == 'album':
        subs = []
        for k in range(5):
            name = f'a{i}-{k}.jpg'; photo(name, 720, 540 if k % 2 == 0 else 900, i * 10 + k)
            subs.append({'media_type': 'photo', 'type': 'photo', 'media': {'image': {'src': f'MOCK/img/{name}', 'width': 720, 'height': 540}}, 'target': {'id': f'alb{i}-{k}'}})
        post['full_picture'] = subs[0]['media']['image']['src']
        post['attachments'] = {'data': [{'media_type': 'album', 'type': 'album', 'subattachments': {'data': subs}}]}
    elif kind in ('video', 'video_vertical'):
        name = f'v{i}.jpg'
        if kind == 'video': photo(name, 720, 405, i)
        else: photo(name, 405, 720, i)
        post['full_picture'] = f'MOCK/img/{name}'
        post['status_type'] = 'added_video'
        post['attachments'] = {'data': [{'media_type': 'video', 'type': 'video_inline', 'url': f'https://www.facebook.com/DialogoMex/videos/{700 + i}/',
            'media': {'image': {'src': f'MOCK/img/{name}', 'width': 720, 'height': 405}, 'source': 'https://video.example/x.mp4'}, 'target': {'id': f'{700 + i}', 'url': f'https://www.facebook.com/DialogoMex/videos/{700 + i}/'}}]}
    elif kind == 'link':
        name = f'l{i}.jpg'; photo(name, 720, 377, i)
        post['full_picture'] = f'MOCK/img/{name}'
        post['status_type'] = 'shared_story'
        post['attachments'] = {'data': [{'media_type': 'link', 'type': 'share', 'title': 'Gobierno de Michoacán anuncia programa de apoyo a productores', 'description': 'El programa contempla apoyos económicos y capacitación técnica para productores agrícolas del estado.', 'unshimmed_url': 'https://example.com/noticia-apoyo-productores', 'url': 'https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com', 'media': {'image': {'src': f'MOCK/img/{name}', 'width': 720, 'height': 377}}}]}
    # text: no attachment
    posts.append(post)

# A profile-picture update that must be skipped.
posts.insert(5, {'id': f'{page_id}_800001', 'created_time': (now - timedelta(hours=90)).strftime('%Y-%m-%dT%H:%M:%S+0000'),
    'permalink_url': 'https://www.facebook.com/x', 'status_type': 'added_profile_picture', 'full_picture': 'MOCK/img/p0.jpg',
    'attachments': {'data': [{'media_type': 'photo', 'type': 'profile_media', 'media': {'image': {'src': 'MOCK/img/p0.jpg'}}}]}})
# An emoji-only post with photo.
photo('e1.jpg', 720, 720, 99)
posts.insert(8, {'id': f'{page_id}_800002', 'message': '📸🔥', 'created_time': (now - timedelta(hours=140)).strftime('%Y-%m-%dT%H:%M:%S+0000'),
    'permalink_url': 'https://www.facebook.com/DialogoMex/posts/800002', 'full_picture': 'MOCK/img/e1.jpg',
    'attachments': {'data': [{'media_type': 'photo', 'type': 'photo', 'media': {'image': {'src': 'MOCK/img/e1.jpg', 'width': 720, 'height': 720}}, 'target': {'id': 'phe1'}}]}})

posts.sort(key=lambda p: p['created_time'], reverse=True)
json.dump({'page': {'id': page_id, 'name': 'Diálogo', 'link': 'https://www.facebook.com/DialogoMex'}, 'posts': posts}, open(os.path.join(out, 'posts.json'), 'w'), ensure_ascii=False, indent=1)
print(f'{len(posts)} posts, images in {out}/img')
