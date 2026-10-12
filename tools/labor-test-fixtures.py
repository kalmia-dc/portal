from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
root=Path(__file__).resolve().parents[1]/'.labor-local'
root.mkdir(exist_ok=True)
lines=['雇用契約書（架空テスト用）','氏名：架空 花子','入社日：2026年10月20日','職種：歯科衛生士','雇用形態：非常勤','基本給：230,000円','資格手当：5,000円']
im=Image.new('RGB',(1500,1100),'white');draw=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',48)
for i,line in enumerate(lines):draw.text((80,70+i*125),line,font=font,fill='black')
im.save(root/'synthetic-contract.png');im.save(root/'synthetic-contract.jpg')
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
c=canvas.Canvas(str(root/'synthetic-contract-text.pdf'));c.setFont('HeiseiKakuGo-W5',16)
for i,line in enumerate(lines):c.drawString(40,790-i*70,line)
c.save()
c=canvas.Canvas(str(root/'synthetic-contract-scan.pdf'));c.drawImage(str(root/'synthetic-contract.png'),20,200,width=555,height=407);c.save()
c=canvas.Canvas(str(root/'synthetic-locked.pdf'),encrypt='fixture-password');c.drawString(40,790,'Synthetic encrypted document');c.save()
(root/'synthetic-broken.pdf').write_bytes(b'%PDF-corrupt test fixture')
print('Six synthetic fixtures prepared; no real documents used')
