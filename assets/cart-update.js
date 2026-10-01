document.addEventListener('DOMContentLoaded', function () {
  const forms = document.querySelectorAll('form[action="/cart/add"]');

  forms.forEach(form => {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const formData = new FormData(form);

      fetch('/cart/add.js', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(item => {
        // fetch updated cart
        return fetch('/cart.js').then(res => res.json());
      })
      .then(cart => {
        // update cart bubble count
        const bubble = document.querySelector('.cart-count-bubble span');
        if (bubble) {
          bubble.textContent = cart.item_count;
        }
      })
      .catch(error => {
        console.error('cart update failed:', error);
      });
    });
  });
});
