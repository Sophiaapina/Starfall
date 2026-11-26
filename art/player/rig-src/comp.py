from PIL import Image
import rig
BG=(20,16,32,255)
jet=Image.open('jetpack.png').convert('RGBA'); body=Image.open('body.png').convert('RGBA')
def compose(layers, body_dy=0, flame=None, bg=True):
    im=Image.new('RGBA',(96,176),BG if bg else (0,0,0,0))
    def sh(img,dy):
        if dy==0: return img
        o=Image.new('RGBA',img.size,(0,0,0,0)); o.alpha_composite(img,(0,dy)); return o
    if flame is not None: im.alpha_composite(sh(flame,body_dy))
    im.alpha_composite(layers['leg-far']); im.alpha_composite(layers['arm-far'])
    im.alpha_composite(sh(jet,body_dy)); im.alpha_composite(layers['leg-near'])
    im.alpha_composite(sh(body,body_dy)); im.alpha_composite(layers['arm-near'])
    return im
def strip(ims, scale=3, path='strip.png'):
    W=sum(i.width for i in ims)+4*(len(ims)-1)
    s=Image.new('RGBA',(W,ims[0].height),(40,36,52,255)); x=0
    for i in ims: s.alpha_composite(i,(x,0)); x+=i.width+4
    s=s.resize((s.width*scale,s.height*scale),Image.NEAREST); s.save(path); return s
