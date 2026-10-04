if (!customElements.get('product-form')) {
  customElements.define('product-form', class ProductForm extends HTMLElement {
    constructor() {
      super();

      this.form = this.querySelector('form');
      this.form.querySelector('[name=id]').disabled = false;
      this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
      // a cart drawer keeps its own flow; the page cart confirms on the button
      // itself instead of opening a notification popup
      this.cart = document.querySelector('cart-drawer');
      this.submitButton = this.querySelector('[type="submit"]');
      if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');
    }

    onSubmitHandler(evt) {
      evt.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

      this.handleErrorMessage();

      this.submitButton.setAttribute('aria-disabled', true);
      this.submitButton.classList.add('loading');
      this.querySelector('.loading-overlay__spinner').classList.remove('hidden');

      const config = fetchConfig('javascript');
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];

      const formData = new FormData(this.form);
      if (this.cart) {
        formData.append('sections', this.cart.getSectionsToRender().map((section) => section.id));
        formData.append('sections_url', window.location.pathname);
        this.cart.setActiveElement(document.activeElement);
      }
      config.body = formData;

      fetch(`${routes.cart_add_url}`, config)
        .then((response) => response.json())
        .then((response) => {
          if (response.status) {
            this.handleErrorMessage(response.description);

            const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
            if (!soldOutMessage) return;
            this.submitButton.setAttribute('aria-disabled', true);
            this.submitButton.querySelector('span').classList.add('hidden');
            soldOutMessage.classList.remove('hidden');
            this.error = true;
            return;
          } else if (!this.cart) {
            publish(PUB_SUB_EVENTS.cartUpdate, {source: 'product-form'});
            this.showAddedState();
            this.refreshBagCount();
            return;
          }

          if (!this.error) publish(PUB_SUB_EVENTS.cartUpdate, {source: 'product-form'});
          this.error = false;
          const quickAddModal = this.closest('quick-add-modal');
          if (quickAddModal) {
            document.body.addEventListener('modalClosed', () => {
              setTimeout(() => { this.cart.renderContents(response) });
            }, { once: true });
            quickAddModal.hide(true);
          } else {
            this.cart.renderContents(response);
          }
        })
        .catch((e) => {
          console.error(e);
        })
        .finally(() => {
          this.submitButton.classList.remove('loading');
          if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
          if (!this.error) this.submitButton.removeAttribute('aria-disabled');
          this.querySelector('.loading-overlay__spinner').classList.add('hidden');
        });
    }

    showAddedState() {
      const label = this.submitButton.querySelector('span');
      if (!label) return;
      const addedLabel = this.submitButton.dataset.addedLabel || 'Added ✓';
      if (label.textContent !== addedLabel) this.defaultSubmitLabel = label.textContent;
      label.textContent = addedLabel;
      this.submitButton.classList.add('is-added');
      clearTimeout(this.addedStateTimer);
      this.addedStateTimer = setTimeout(() => {
        // a variant change may have rewritten the label meanwhile; only undo our own text
        if (label.textContent === addedLabel) label.textContent = this.defaultSubmitLabel;
        this.submitButton.classList.remove('is-added');
      }, 900);
    }

    refreshBagCount() {
      fetch(`${routes.cart_url}.js`)
        .then((response) => response.json())
        .then((cart) => {
          const count = document.getElementById('CartBubble');
          if (count) {
            count.textContent = cart.item_count;
            count.setAttribute('data-cart-count', cart.item_count);
          }
          const bag = document.getElementById('CustomMenuBagLink');
          if (bag) bag.classList.toggle('custom-menu-item--bag', cart.item_count > 0);
        })
        .catch((e) => console.error(e));
    }

    handleErrorMessage(errorMessage = false) {
      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
      if (!this.errorMessageWrapper) return;
      this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

      this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

      if (errorMessage) {
        this.errorMessage.textContent = errorMessage;
      }
    }
  });
}
