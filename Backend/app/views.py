from django.views.decorators.csrf import ensure_csrf_cookie
from django.shortcuts import render

# Create your views here.
@ensure_csrf_cookie
def home(request):
    return render(request, 'app/index.html')