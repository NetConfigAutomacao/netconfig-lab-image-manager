/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const messages = document.getElementById('messages');

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabButtons.forEach(function (b) {
        b.classList.remove('active');
      });
      tabContents.forEach(function (c) {
        c.classList.remove('active');
      });

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const content = document.getElementById(targetId);
      if (content) {
        content.classList.add('active');
      }

      if (messages) {
        messages.innerHTML = '';
      }
    });
  });
});

